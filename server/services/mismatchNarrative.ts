/**
 * Mismatch Narrative Generator
 *
 * Produces a concise 1–2 sentence natural-language explanation for each
 * DamageMismatch, covering:
 *   1. What is inconsistent
 *   2. Why it matters
 *   3. What should be checked
 *
 * Strategy:
 *   - Primary: deterministic template engine (instant, no LLM cost)
 *   - Optional: LLM enrichment pass for a more fluent, context-aware narrative
 *     (only triggered when `useLlm` is true and the mismatch has sufficient detail)
 */

import type { DamageMismatch, MismatchType } from "./damageConsistency";
import { getDb } from "../db";
import { narrativeVersions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { evaluateEnrichmentGate } from "./enrichmentGate";
import type { EnrichmentGateInput } from "./enrichmentGate";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Versioned narrative context ────────────────────────────────────────────

/**
 * Optional context for persisting versioned narrative records to the DB.
 * When provided, each generated narrative is stored as a new version row
 * in `narrative_versions`, with the previous active version deactivated.
 */
export interface NarrativePersistContext {
  claimId: number;
  assessmentId: number;
  /** Source tag written to the version row. Defaults to "template" or "llm_background" */
  source?: "template" | "llm_background" | "manual";
  /** userId of the person triggering generation (null for automated runs) */
  createdBy?: number | null;
}

export interface MismatchNarrative {
  mismatch_type: MismatchType;
  severity: "low" | "medium" | "high";
  explanation: string;           // 1–2 sentences: what / why / check (internal)
  base_narrative: string;        // always the deterministic template output
  external_narrative: string;   // neutral, non-accusatory version for external sharing
  source: "template" | "llm";   // how the internal narrative was generated
  preserves_meaning?: boolean;   // true when LLM confirms meaning is preserved
  /** DB row id of the active version record (set when persist context is provided) */
  active_version_id?: number;
  /** Incremented version number of the active record */
  version?: number;
}

// ─── Template engine ──────────────────────────────────────────────────────────

/**
 * Returns a deterministic narrative for a single mismatch using typed templates.
 * Fills in source_a / source_b / component where available.
 */
function templateNarrative(m: DamageMismatch): string {
  const a = m.source_a ?? "source A";
  const b = m.source_b ?? "source B";
  const comp = m.component ? `"${m.component}"` : "a component";

  switch (m.type) {
    case "zone_mismatch":
      return (
        `${a} indicates damage in the ${a.toLowerCase().includes("photo") ? "photos" : a} zone, ` +
        `but the claim document describes damage in the ${b} zone. ` +
        `This zone discrepancy may indicate misreporting or secondary impact. ` +
        `Recommend physical inspection of both zones.`
      );

    case "component_unreported":
      return (
        `${comp} was detected in the damage photos but is not mentioned in the claim document. ` +
        `Unreported components may indicate undisclosed pre-existing damage or post-incident additions. ` +
        `Verify whether this component was damaged in the reported incident.`
      );

    case "component_not_visible":
      return (
        `${comp} is listed in the claim document but is not visible in any of the submitted photos. ` +
        `Missing photo evidence for a claimed component reduces assessment confidence. ` +
        `Request additional photos specifically showing this component.`
      );

    case "severity_mismatch":
      return (
        `The document describes ${a}-severity damage, but the photos indicate ${b}-severity damage to the same area. ` +
        `Severity discrepancies can affect repair cost estimates significantly. ` +
        `A physical inspection is recommended to confirm the actual damage extent.`
      );

    case "physics_zone_conflict":
      return (
        `The physics analysis places the primary impact in the ${a} zone, ` +
        `but the claim document reports damage in the ${b} zone. ` +
        `A conflict between the calculated impact zone and the reported zone may indicate a misreported impact direction. ` +
        `Cross-reference with witness statements and scene photographs.`
      );

    case "photo_zone_conflict":
      return (
        `Photos show damage concentrated in the ${a} zone, ` +
        `while the physics impact vector points to the ${b} zone. ` +
        `This discrepancy may suggest secondary damage or an inaccurate physics model input. ` +
        `Review the impact speed and angle data used in the physics calculation.`
      );

    case "no_photo_evidence":
      return (
        `No photos have been submitted to support the damage described in the claim document. ` +
        `Without photographic evidence, damage claims cannot be independently verified. ` +
        `Request the claimant to submit clear photos of all damaged areas before proceeding.`
      );

    case "no_document_evidence":
      return (
        `Damage is visible in the submitted photos but is not described in the claim document. ` +
        `Undocumented visible damage may indicate additional unreported damage or a pre-existing condition. ` +
        `Review the claim form with the claimant to confirm whether this damage is part of the reported incident.`
      );

    default:
      return (
        `An inconsistency was detected between damage evidence sources. ` +
        `${m.details} ` +
        `Manual review is recommended to resolve this discrepancy.`
      );
  }
}

// ─── LLM enrichment ──────────────────────────────────────────────────────────

/** Structured output returned by the LLM enrichment call */
interface LlmEnrichmentResult {
  enriched_narrative: string;
  preserves_meaning: boolean;
}

/**
 * Uses the LLM to produce a more fluent, context-aware narrative for a single
 * mismatch. Operates under strict constraints:
 *   1. MUST NOT contradict the base narrative
 *   2. MUST NOT introduce new facts
 *   3. May only clarify, simplify, or improve readability
 *   4. Output must be exactly 2 sentences
 *   5. Neutral, professional insurance-report tone
 *
 * Returns a structured { enriched_narrative, preserves_meaning } object.
 * Falls back to the template on any error or when preserves_meaning is false.
 */
async function llmNarrative(
  m: DamageMismatch,
  baseNarrative: string
): Promise<{ text: string; preserves_meaning: boolean }> {
  try {
    const { invokeLLM } = await import("../_core/llm");

    const systemPrompt = [
      `You are an insurance claims language editor. Your only task is to improve the`,
      `readability of a pre-written finding note — you MUST NOT add, remove, or contradict`,
      `any information already present in the base narrative.`,
      ``,
      `STRICT RULES (violations will cause the output to be discarded):`,
      `  1. DO NOT contradict the base narrative.`,
      `  2. DO NOT introduce any new facts, zones, components, or conclusions.`,
      `  3. Only clarify, simplify, or improve sentence flow.`,
      `  4. Output MUST be exactly 2 sentences.`,
      `  5. Use neutral, professional language suitable for an insurance report.`,
      `  6. Do NOT start with "I", "The system", or any first-person pronoun.`,
      `  7. Do NOT use bullet points, headers, or markdown formatting.`,
      `  8. Total output MUST NOT exceed 60 words.`,
      ``,
      `After producing the enriched narrative, set "preserves_meaning" to true ONLY if`,
      `you are certain the enriched narrative does not contradict or extend the base narrative.`,
      `If in doubt, set it to false.`,
    ].join("\n");

    const userPrompt = [
      `Mismatch type: ${m.type}`,
      `Severity: ${m.severity}`,
      `Evidence summary:`,
      `  Details: ${m.details}`,
      m.source_a ? `  Source A: ${m.source_a}` : "",
      m.source_b ? `  Source B: ${m.source_b}` : "",
      m.component ? `  Component: ${m.component}` : "",
      ``,
      `Base narrative (do NOT contradict this):`,
      `"${baseNarrative}"`,
      ``,
      `Return the enriched narrative and preserves_meaning flag as JSON.`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "mismatch_narrative_enrichment",
          strict: true,
          schema: {
            type: "object",
            properties: {
              enriched_narrative: {
                type: "string",
                description:
                  "The improved 2-sentence narrative. Must not contradict or extend the base narrative.",
              },
              preserves_meaning: {
                type: "boolean",
                description:
                  "True only if the enriched narrative preserves the full meaning of the base narrative without contradiction.",
              },
            },
            required: ["enriched_narrative", "preserves_meaning"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const jsonText: string =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!jsonText) {
      return { text: baseNarrative, preserves_meaning: false };
    }

    const parsed: LlmEnrichmentResult = JSON.parse(jsonText);

    // Guard: reject if preserves_meaning is false or narrative is too short/long
    if (
      !parsed.preserves_meaning ||
      typeof parsed.enriched_narrative !== "string" ||
      parsed.enriched_narrative.length < 20 ||
      parsed.enriched_narrative.length > 500
    ) {
      return { text: baseNarrative, preserves_meaning: false };
    }

    return {
      text: parsed.enriched_narrative.trim(),
      preserves_meaning: true,
    };
  } catch {
    return { text: baseNarrative, preserves_meaning: false };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Versioned persistence helpers ──────────────────────────────────────────

/**
 * Deactivates all existing active versions for a given mismatch index,
 * then inserts a new version row and returns its id and version number.
 */
async function persistNarrativeVersion(
  mismatchIndex: number,
  mismatch: DamageMismatch,
  narrative: Omit<MismatchNarrative, "active_version_id" | "version">,
  ctx: NarrativePersistContext
): Promise<{ id: number; version: number }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = Date.now();
  // Find the highest existing version for this mismatch index
  const existing = await db
    .select({ version: narrativeVersions.version })
    .from(narrativeVersions)
    .where(
      and(
        eq(narrativeVersions.assessmentId, ctx.assessmentId),
        eq(narrativeVersions.mismatchIndex, mismatchIndex)
      )
    )
    .orderBy(narrativeVersions.version);

  const nextVersion =
    existing.length > 0
      ? Math.max(...existing.map((r) => r.version)) + 1
      : 1;

  // Deactivate all previous active versions for this mismatch
  if (existing.length > 0) {
    await db
      .update(narrativeVersions)
      .set({ isActive: 0 })
      .where(
        and(
          eq(narrativeVersions.assessmentId, ctx.assessmentId),
          eq(narrativeVersions.mismatchIndex, mismatchIndex),
          eq(narrativeVersions.isActive, 1)
        )
      );
  }

  // Insert the new active version
  const source = ctx.source ?? (narrative.source === "llm" ? "llm_background" : "template");

  const [result] = await db
    .insert(narrativeVersions)
    .values({
      claimId: ctx.claimId,
      assessmentId: ctx.assessmentId,
      mismatchIndex,
      mismatchType: mismatch.type,
      version: nextVersion,
      isActive: 1,
      baseNarrative: narrative.base_narrative,
      enrichedNarrative: narrative.source === "llm" ? narrative.explanation : null,
      externalNarrative: narrative.external_narrative,
      preservesMeaning:
        narrative.preserves_meaning === true
          ? 1
          : narrative.preserves_meaning === false
          ? 0
          : null,
      source,
      createdAt: now,
      createdBy: ctx.createdBy ?? null,
    })
    .$returningId();

  return { id: (result as { id: number }).id, version: nextVersion };
}

/**
 * Retrieves all narrative versions for a given assessment, ordered by
 * mismatch_index ASC, version ASC. Used for the audit history view.
 */
export async function getNarrativeVersionHistory(
  assessmentId: number
): Promise<typeof narrativeVersions.$inferSelect[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(narrativeVersions)
    .where(eq(narrativeVersions.assessmentId, assessmentId))
    .orderBy(narrativeVersions.mismatchIndex, narrativeVersions.version);
}

export interface GenerateNarrativesOptions {
  /**
   * Whether to use the LLM for enrichment.
   * Defaults to false (template-only) to keep latency predictable.
   * Set to true when called from an async background job.
   *
   * When `enrichmentGateContext` is also provided, `useLlm: true` is treated
   * as a request to enrich — but the gate may still suppress it per its rules.
   */
  useLlm?: boolean;
  /**
   * When provided, each generated narrative is persisted as a new version
   * row in `narrative_versions`. Previous active versions are deactivated.
   * When omitted, no DB writes occur (pure in-memory generation).
   */
  persistContext?: NarrativePersistContext;
  /**
   * Stage 25 — LLM Enrichment Gate context.
   *
   * When provided alongside `useLlm: true`, the gate evaluates two conditions
   * before allowing enrichment to proceed:
   *   1. currentVersionSource === "template"  (never been LLM-enriched)
   *   2. negative feedback rate > 0.20        (adjusters are dismissing the narrative)
   *
   * If neither condition is met, enrichment is skipped for that mismatch,
   * preserving the existing LLM-generated narrative and avoiding version churn.
   *
   * When omitted, the gate is bypassed and `useLlm` controls enrichment directly.
   */
  enrichmentGateContext?: {
    /** Per-mismatch-type annotation counts, keyed by mismatch type string */
    annotationCountsByType: Record<string, { confirmed: number; dismissed: number }>;
    /** The source of the current active narrative version, keyed by mismatch index */
    currentVersionSourceByIndex: Record<number, string>;
  };
}

/**
 * Generates a narrative explanation for each mismatch in the list.
 *
 * @param mismatches  Array of DamageMismatch objects from the consistency check
 * @param options     { useLlm?: boolean }
 * @returns           Array of MismatchNarrative objects in the same order
 */
export async function generateMismatchNarratives(
  mismatches: DamageMismatch[],
  options: GenerateNarrativesOptions = {}
): Promise<MismatchNarrative[]> {
  const { useLlm = false } = options;

  const results: MismatchNarrative[] = [];

  for (let mismatchIdx = 0; mismatchIdx < mismatches.length; mismatchIdx++) {
    const m = mismatches[mismatchIdx];
    let explanation: string;
    let source: "template" | "llm" = "template";
    let preserves_meaning: boolean | undefined;

    // Always generate the deterministic base narrative first.
    const baseNarrative = templateNarrative(m);

    // ── Stage 25: LLM Enrichment Gate ──────────────────────────────────────
    // When a gate context is provided, evaluate whether enrichment should run
    // for this specific mismatch before invoking the LLM.
    let effectiveUseLlm = useLlm;
    if (useLlm && options.enrichmentGateContext) {
      const counts = options.enrichmentGateContext.annotationCountsByType[m.type] ?? { confirmed: 0, dismissed: 0 };
      const currentSource = options.enrichmentGateContext.currentVersionSourceByIndex[mismatchIdx] ?? "template";
      const gateInput: EnrichmentGateInput = {
        currentVersionSource: currentSource,
        confirmedCount: counts.confirmed,
        dismissedCount: counts.dismissed,
      };
      const gateResult = evaluateEnrichmentGate(gateInput);
      effectiveUseLlm = gateResult.shouldEnrich;
    }
    // ── End Gate ────────────────────────────────────────────────────────────

    if (effectiveUseLlm) {
      // Pass the base narrative to the LLM so it can only clarify/simplify it.
      const llmResult = await llmNarrative(m, baseNarrative);

      if (llmResult.preserves_meaning && llmResult.text !== baseNarrative) {
        // LLM produced a valid, meaning-preserving enrichment.
        explanation = llmResult.text;
        source = "llm";
        preserves_meaning = true;
      } else {
        // LLM failed the meaning-preservation check or returned the same text;
        // fall back to the deterministic template.
        explanation = baseNarrative;
        preserves_meaning = false;
      }
    } else {
      explanation = baseNarrative;
    }

    // Always generate the deterministic external-safe narrative first.
    const baseExternal = externalTemplate(m);

    // Optionally enrich the external narrative via LLM (same gate as internal narrative).
    // Uses effectiveUseLlm so the enrichment gate applies to both internal and external.
    const external_narrative = effectiveUseLlm
      ? await llmExternalNarrative(m, baseExternal)
      : baseExternal;

    const narrative: MismatchNarrative = {
      mismatch_type: m.type,
      severity: m.severity,
      explanation,
      base_narrative: baseNarrative,
      external_narrative,
      source,
    };
    if (preserves_meaning !== undefined) {
      narrative.preserves_meaning = preserves_meaning;
    }

    // Persist versioned record if context is provided
    if (options.persistContext) {
      try {
        const { id, version } = await persistNarrativeVersion(
          results.length, // mismatch index = current position
          m,
          narrative,
          options.persistContext
        );
        narrative.active_version_id = id;
        narrative.version = version;
      } catch {
        // Persistence failure must not block narrative generation
      }
    }

    results.push(narrative);
  }

  return results;
}

// ─── External-safe narrative ──────────────────────────────────────────────────────────

/**
 * Deterministic external-safe template for each mismatch type.
 *
 * Rules enforced in every template:
 *   1. NO suspicion language (fraud, misrepresent, undisclosed, omit, conceal,
 *      tamper, inflate, exaggerate, pre-existing condition, misreporting)
 *   2. NO scoring or confidence references (score, weight, confidence,
 *      high/medium/low severity, risk level, factor, penalty)
 *   3. NO internal logic references (physics engine, delta-V, impact vector,
 *      consistency check, algorithm, AI analysis, machine learning)
 *   4. NEVER imply wrongdoing — passive, neutral phrasing only
 *   5. Always include one of:
 *        - "further review required"
 *        - "further review is recommended"
 *        - "additional verification needed"
 *        - "additional documentation may be required"
 */
function externalTemplate(m: DamageMismatch): string {
  switch (m.type) {
    case "zone_mismatch": {
      return (
        `An inconsistency has been observed between the area referenced in the claim ` +
        `documentation and the area identified in the submitted evidence. ` +
        `Further review is required to confirm the affected area before the assessment can be completed.`
      );
    }
    case "component_unreported": {
      const c = m.component
        ? `${m.component.charAt(0).toUpperCase()}${m.component.slice(1)}`
        : "A component";
      return (
        `${c} identified in the submitted evidence requires additional verification ` +
        `against the claim documentation. ` +
        `Further review is recommended to confirm the full scope of the assessment.`
      );
    }
    case "component_not_visible": {
      const c = m.component
        ? `${m.component.charAt(0).toUpperCase()}${m.component.slice(1)}`
        : "A component";
      return (
        `${c} referenced in the claim documentation requires additional verification. ` +
        `Further review is recommended — please submit supporting photographic evidence ` +
        `for this item to allow the assessment to proceed.`
      );
    }
    case "severity_mismatch": {
      return (
        `An inconsistency has been observed in the damage assessment for this area. ` +
        `Further review is required to confirm the extent of the damage before the assessment can be finalised.`
      );
    }
    case "physics_zone_conflict": {
      return (
        `An inconsistency has been observed between the impact area described in the claim ` +
        `and the area identified through the technical review. ` +
        `Additional verification is needed to confirm the impact location.`
      );
    }
    case "photo_zone_conflict": {
      return (
        `An inconsistency has been observed between the area referenced in the claim ` +
        `and the area identified in the submitted photographs. ` +
        `Further review is required to confirm the affected area.`
      );
    }
    case "no_photo_evidence": {
      const c = m.component ?? "the reported damage area";
      return (
        `Supporting photographic evidence for ${c} could not be identified in the submitted images. ` +
        `Additional verification is needed — please submit clear photographs of the relevant area ` +
        `to allow the assessment to proceed.`
      );
    }
    case "no_document_evidence": {
      return (
        `An item identified in the submitted evidence requires additional verification ` +
        `against the claim documentation. ` +
        `Further review is recommended to confirm the documented scope of the claim.`
      );
    }
    default:
      return (
        `An inconsistency has been observed in the submitted claim evidence. ` +
        `Further review is required before the assessment can be completed.`
      );
  }
}

/** Structured output returned by the external narrative LLM call */
interface ExternalNarrativeLlmResult {
  external_narrative: string;
}

/**
 * Uses the LLM to produce a more fluent external-safe narrative.
 *
 * The system prompt enforces three absolute categories of prohibition:
 *   A) Suspicion language — fraud, misrepresent, dishonest, deliberate, tamper, etc.
 *   B) Scoring / internal logic — score, weight, confidence, physics engine, delta-V, etc.
 *   C) Wrongdoing implication — any phrasing that suggests the claimant acted improperly
 *
 * A post-generation guard regex list independently validates the output before
 * returning it. Any violation causes a silent fallback to the deterministic template.
 */
async function llmExternalNarrative(
  m: DamageMismatch,
  baseExternal: string
): Promise<string> {
  try {
    const { invokeLLM } = await import("../_core/llm");

    const systemPrompt = [
      `You are an insurance communications specialist. Your only task is to improve the`,
      `readability of a pre-written external-safe claim note that will be shared directly`,
      `with the claimant and third parties. You must not change the meaning or add information.`,
      ``,
      `ABSOLUTE PROHIBITIONS — any violation will cause the output to be DISCARDED:`,
      ``,
      `  A) SUSPICION LANGUAGE — NEVER use any of these words or their variants:`,
      `       fraud, fraudulent, misrepresent, misreporting, dishonest, deliberate,`,
      `       intentional, fabricate, tamper, conceal, omit, undisclosed, suspicious,`,
      `       suspect, false, forged, inflated, exaggerated, staged, collusion, scheme,`,
      `       deceptive, misleading, pre-existing condition.`,
      ``,
      `  B) SCORING / INTERNAL LOGIC — NEVER reference:`,
      `       score, weight, confidence, severity level, high/medium/low risk, factor,`,
      `       physics engine, delta-V, impact vector, consistency check, algorithm,`,
      `       machine learning, AI analysis, fraud score, risk score, penalty.`,
      ``,
      `  C) WRONGDOING — NEVER imply the claimant acted improperly. Use passive voice only.`,
      `     Do NOT write anything that could be read as an accusation or allegation.`,
      ``,
      `REQUIRED — the output MUST include at least one of these neutral anchor phrases:`,
      `    "further review required"`,
      `    "further review is recommended"`,
      `    "additional verification needed"`,
      `    "additional verification is needed"`,
      `    "additional documentation may be required"`,
      ``,
      `FORMATTING RULES:`,
      `  1. Output MUST be exactly 1–2 sentences.`,
      `  2. Total output MUST NOT exceed 60 words.`,
      `  3. Professional, plain English. No bullet points, headers, or markdown.`,
      `  4. Do NOT start with "I", "We", or any first-person pronoun.`,
      `  5. DO NOT introduce new facts, zones, components, or conclusions.`,
      `  6. DO NOT contradict the base narrative.`,
    ].join("\n");

    const userPrompt = [
      `Base external narrative (do NOT contradict this):`,
      `"${baseExternal}"`,
      ``,
      `Return the improved external narrative as JSON.`,
    ].join("\n");

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "external_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              external_narrative: {
                type: "string",
                description:
                  "Neutral 1–2 sentence narrative for external sharing with claimants. " +
                  "MUST include 'further review required', 'further review is recommended', " +
                  "'additional verification needed', or 'additional documentation may be required'. " +
                  "MUST NOT contain: fraud, score, weight, confidence, misrepresent, suspect, " +
                  "deliberate, false, omit, conceal, tamper, inflate, physics engine, delta-V, " +
                  "impact vector, algorithm, risk score, or any language implying wrongdoing.",
              },
            },
            required: ["external_narrative"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const jsonText: string =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!jsonText) return baseExternal;

    const parsed: ExternalNarrativeLlmResult = JSON.parse(jsonText);
    const text = parsed.external_narrative?.trim() ?? "";

    // ── Post-generation guard ─────────────────────────────────────────────────
    // Mirrors the system-prompt prohibitions. Intentionally broad — false
    // positives fall back to the safe template, which is the correct behaviour.
    const FORBIDDEN_PATTERNS: RegExp[] = [
      // A) Suspicion / wrongdoing language
      /\bfraud(ulent)?\b/i,
      /\bmisrepresent/i,
      /\bdishonest/i,
      /\bdeliberate/i,
      /\bintentional/i,
      /\bsuspect(ed|ious)?\b/i,
      /\bfalse\b/i,
      /\bfabricat/i,
      /\btamper/i,
      /\bconceal/i,
      /\bomit(ted|ting)?\b/i,
      /\bundisclos/i,
      /\binflat/i,
      /\bexaggerat/i,
      /\bstaged?\b/i,
      /\bcollusion\b/i,
      /\bdecepti/i,
      /\bmislead/i,
      /\bmisreport/i,
      /\bforged?\b/i,
      /\bscheme\b/i,
      /\bpre[- ]existing condition\b/i,
      // B) Scoring / internal logic references
      /\bscore\b/i,
      /\bweight(ed)?\b/i,
      /\bconfidence\b/i,
      /\bseverity (level|score|rating)\b/i,
      /\b(high|medium|low)[- ]risk\b/i,
      /\bphysics engine\b/i,
      /\bdelta[- ]?v\b/i,
      /\bimpact vector\b/i,
      /\bconsistency (check|score)\b/i,
      /\balgorithm\b/i,
      /\bmachine learning\b/i,
      /\bfraud score\b/i,
      /\brisk score\b/i,
      /\bpenalty\b/i,
      /\bai analysis\b/i,
      // C) Investigative tone
      /\binvestigat/i,
    ];

    // Also require at least one neutral anchor phrase
    const REQUIRED_NEUTRAL: RegExp[] = [
      /further review (is )?(required|recommended)/i,
      /additional verification (is )?needed/i,
      /additional documentation may be required/i,
    ];

    const hasForbidden = FORBIDDEN_PATTERNS.some((re) => re.test(text));
    const hasNeutral = REQUIRED_NEUTRAL.some((re) => re.test(text));

    if (hasForbidden || !hasNeutral || text.length < 20 || text.length > 500) {
      return baseExternal;
    }

    return text;
  } catch {
    return baseExternal;
  }
}

/**
 * Convenience: generate a single narrative for one mismatch.
 */
export async function generateSingleNarrative(
  mismatch: DamageMismatch,
  options: GenerateNarrativesOptions = {}
): Promise<MismatchNarrative> {
  const [result] = await generateMismatchNarratives([mismatch], options);
  return result;
}
