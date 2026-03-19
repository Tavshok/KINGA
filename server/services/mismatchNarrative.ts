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
  const db = getDb();
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
  const db = getDb();
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
   */
  useLlm?: boolean;
  /**
   * When provided, each generated narrative is persisted as a new version
   * row in `narrative_versions`. Previous active versions are deactivated.
   * When omitted, no DB writes occur (pure in-memory generation).
   */
  persistContext?: NarrativePersistContext;
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

  for (const m of mismatches) {
    let explanation: string;
    let source: "template" | "llm" = "template";
    let preserves_meaning: boolean | undefined;

    // Always generate the deterministic base narrative first.
    const baseNarrative = templateNarrative(m);

    if (useLlm) {
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

    // Optionally enrich the external narrative via LLM (same useLlm gate).
    const external_narrative = useLlm
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
 * Uses neutral, non-accusatory phrasing suitable for sharing with claimants
 * and third parties. No investigative or fraud-implying language.
 */
function externalTemplate(m: DamageMismatch): string {
  switch (m.type) {
    case "zone_mismatch": {
      const a = m.source_a ?? "one area";
      const b = m.source_b ?? "another area";
      return `An inconsistency has been observed between the ${a} zone referenced in the claim documentation and the ${b} zone identified in the submitted evidence. Further review is recommended to verify the affected area.`;
    }
    case "component_unreported": {
      const c = m.component ?? "a component";
      return `${c.charAt(0).toUpperCase() + c.slice(1)} has been identified in the submitted evidence but does not appear in the claim documentation. Verification of the documented damage scope is recommended.`;
    }
    case "component_not_visible": {
      const c = m.component ?? "A component";
      return `${c.charAt(0).toUpperCase() + c.slice(1)} referenced in the claim documentation requires verification, as corresponding visual evidence was not identified in the submitted images. Further documentation may be required.`;
    }
    case "severity_mismatch": {
      const a = m.source_a ?? "one source";
      const b = m.source_b ?? "another source";
      return `An inconsistency has been observed in the severity assessment between ${a} and ${b}. Further review is recommended to confirm the extent of damage.`;
    }
    case "physics_zone_conflict": {
      const a = m.source_a ?? "the reported impact zone";
      const b = m.source_b ?? "the physics analysis zone";
      return `An inconsistency has been observed between the reported impact zone (${a}) and the technical analysis result (${b}). Further review is recommended to confirm the impact location.`;
    }
    case "photo_zone_conflict": {
      const a = m.source_a ?? "the reported zone";
      const b = m.source_b ?? "the photo evidence zone";
      return `An inconsistency has been observed between the zone referenced in the claim (${a}) and the zone identified in the submitted photographs (${b}). Further review is recommended.`;
    }
    case "no_photo_evidence": {
      const c = m.component ?? "reported damage";
      return `Visual evidence for ${c} could not be identified in the submitted photographs. Submission of additional supporting images is recommended to complete the assessment.`;
    }
    case "no_document_evidence": {
      const c = m.component ?? "identified damage";
      return `${c.charAt(0).toUpperCase() + c.slice(1)} identified in the submitted evidence requires verification against the claim documentation. Additional documentation may be required.`;
    }
    default:
      return "An inconsistency has been observed in the submitted claim evidence. Further review is recommended.";
  }
}

/** Structured output returned by the external narrative LLM call */
interface ExternalNarrativeLlmResult {
  external_narrative: string;
}

/**
 * Uses the LLM to produce a more fluent external-safe narrative.
 * Strictly enforces neutral, non-accusatory language rules.
 * Falls back to the deterministic template on any error.
 */
async function llmExternalNarrative(
  m: DamageMismatch,
  baseExternal: string
): Promise<string> {
  try {
    const { invokeLLM } = await import("../_core/llm");

    const systemPrompt = [
      `You are an insurance communications specialist. Your task is to convert an internal`,
      `claims assessment note into external-safe language suitable for sharing with claimants`,
      `and third parties.`,
      ``,
      `STRICT RULES (violations will cause the output to be discarded):`,
      `  1. REMOVE all investigative tone — do not imply the claimant is dishonest.`,
      `  2. AVOID any language that implies fraud, misrepresentation, or deliberate omission.`,
      `  3. Use ONLY neutral phrasing such as:`,
      `       - "requires verification"`,
      `       - "inconsistency observed"`,
      `       - "further review recommended"`,
      `       - "additional documentation may be required"`,
      `  4. DO NOT introduce new facts, zones, or components not present in the base text.`,
      `  5. Output MUST be exactly 1–2 sentences.`,
      `  6. Use professional, plain English. No bullet points, headers, or markdown.`,
      `  7. Total output MUST NOT exceed 60 words.`,
      `  8. Do NOT start with "I", "We", or any first-person pronoun.`,
    ].join("\n");

    const userPrompt = [
      `Mismatch type: ${m.type}`,
      `Severity: ${m.severity}`,
      m.source_a ? `  Source A: ${m.source_a}` : "",
      m.source_b ? `  Source B: ${m.source_b}` : "",
      m.component ? `  Component: ${m.component}` : "",
      ``,
      `Base external narrative (do NOT contradict this):`,
      `"${baseExternal}"`,
      ``,
      `Return the external narrative as JSON.`,
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
          name: "external_narrative",
          strict: true,
          schema: {
            type: "object",
            properties: {
              external_narrative: {
                type: "string",
                description:
                  "Neutral, non-accusatory 1–2 sentence narrative for external sharing. Must not imply fraud or investigative intent.",
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

    // Sanity checks: length and no forbidden investigative phrases
    const FORBIDDEN = [
      /\bfraud\b/i,
      /\bmisrepresent/i,
      /\bdishonest/i,
      /\bdeliberate/i,
      /\bsuspect/i,
      /\bfalse\b/i,
      /\bfabricate/i,
      /\binvestigat/i,
    ];
    const hasForbidden = FORBIDDEN.some((re) => re.test(text));

    if (hasForbidden || text.length < 20 || text.length > 500) {
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
