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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MismatchNarrative {
  mismatch_type: MismatchType;
  severity: "low" | "medium" | "high";
  explanation: string;           // 1–2 sentences: what / why / check
  source: "template" | "llm";   // how the narrative was generated
  preserves_meaning?: boolean;   // true when LLM confirms meaning is preserved
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

export interface GenerateNarrativesOptions {
  /**
   * Whether to use the LLM for enrichment.
   * Defaults to false (template-only) to keep latency predictable.
   * Set to true when called from an async background job.
   */
  useLlm?: boolean;
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

    results.push({
      mismatch_type: m.type,
      severity: m.severity,
      explanation,
      source,
      ...(preserves_meaning !== undefined ? { preserves_meaning } : {}),
    });
  }

  return results;
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
