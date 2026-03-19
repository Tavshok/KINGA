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

/**
 * Uses the LLM to produce a more fluent, context-aware narrative for a single
 * mismatch. Falls back to the template on any error.
 */
async function llmNarrative(m: DamageMismatch): Promise<string> {
  try {
    const { invokeLLM } = await import("../_core/llm");
    const prompt = [
      `You are an insurance claims assessor writing a concise finding note.`,
      ``,
      `A damage consistency check found the following mismatch:`,
      `  Type: ${m.type}`,
      `  Severity: ${m.severity}`,
      `  Details: ${m.details}`,
      m.source_a ? `  Source A: ${m.source_a}` : "",
      m.source_b ? `  Source B: ${m.source_b}` : "",
      m.component ? `  Component: ${m.component}` : "",
      ``,
      `Write exactly 2 sentences:`,
      `  Sentence 1: What is inconsistent (be specific, use the details above).`,
      `  Sentence 2: Why it matters for the claim AND what the assessor should check.`,
      ``,
      `Rules:`,
      `  - Do NOT start with "I" or "The system".`,
      `  - Use plain, professional language suitable for an insurance report.`,
      `  - Do NOT exceed 60 words total.`,
      `  - Do NOT add bullet points, headers, or markdown.`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const text: string =
      typeof rawContent === "string" ? rawContent.trim() : "";

    // Sanity check: must be at least 20 chars and no more than 400 chars
    if (text.length >= 20 && text.length <= 400) {
      return text;
    }
    return templateNarrative(m);
  } catch {
    return templateNarrative(m);
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

    if (useLlm) {
      const llmText = await llmNarrative(m);
      // If LLM returned something different from the template, mark as llm
      const templateText = templateNarrative(m);
      if (llmText !== templateText) {
        explanation = llmText;
        source = "llm";
      } else {
        explanation = templateText;
      }
    } else {
      explanation = templateNarrative(m);
    }

    results.push({
      mismatch_type: m.type,
      severity: m.severity,
      explanation,
      source,
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
