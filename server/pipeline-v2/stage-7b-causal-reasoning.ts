/**
 * pipeline-v2/stage-7b-causal-reasoning.ts
 *
 * STAGE 7b — CAUSAL REASONING ENGINE
 *
 * This engine does what a senior loss adjuster does when reviewing a claim:
 *
 *   1. Read the claimant's account of what happened (incident description)
 *   2. Look at the damage photographs and note what zones were actually hit
 *   3. Review the physics reconstruction — how hard was the impact, at what speed,
 *      in what direction, and how much energy was dissipated?
 *   4. Compare all three sources and ask: does the described cause produce
 *      this damage pattern at this energy level?
 *   5. Identify supporting evidence and contradictions
 *   6. Produce a reasoned narrative verdict with a plausibility score
 *
 * The engine uses multimodal LLM inference — it passes the actual photo URLs
 * alongside the text context so the model can visually inspect the damage.
 *
 * Output: CausalVerdict — stored in causal_verdict_json on ai_assessments.
 */

import { invokeLLM } from "../_core/llm";
import type {
  ClaimRecord,
  Stage6Output,
  Stage7Output,
  CollisionDirection,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CausalEvidence {
  source: "description" | "physics" | "photo" | "damage_components";
  finding: string;
  supports_claim: boolean;
  confidence: number; // 0–100
}

export interface CausalContradiction {
  source_a: string;
  source_b: string;
  description: string;
  severity: "minor" | "moderate" | "major" | "critical";
  implication: string;
}

export interface CausalVerdict {
  /** The most likely true cause of the damage, inferred from all sources */
  inferredCause: string;
  /** How plausible is the claimant's account, given all evidence (0–100) */
  plausibilityScore: number;
  /** Plain-English plausibility band */
  plausibilityBand: "very_low" | "low" | "moderate" | "high" | "very_high";
  /** Collision direction inferred from the full causal analysis */
  inferredCollisionDirection: CollisionDirection;
  /** Whether the physics output is consistent with the described cause */
  physicsAlignment: "consistent" | "partially_consistent" | "inconsistent" | "not_applicable";
  /** Whether the damage photos are consistent with the described cause */
  imageAlignment: "consistent" | "partially_consistent" | "inconsistent" | "no_photos";
  /** Evidence items that support the claimant's account */
  supportingEvidence: CausalEvidence[];
  /** Contradictions between sources */
  contradictions: CausalContradiction[];
  /** Adjuster-style narrative verdict paragraph */
  narrativeVerdict: string;
  /** Whether this verdict should trigger a fraud flag */
  flagForFraud: boolean;
  /** Reason for fraud flag, if any */
  fraudFlagReason: string | null;
  /** LLM reasoning trace (for audit) */
  reasoningTrace: string;
  /** Whether the LLM was used or keyword fallback was applied */
  llmUsed: boolean;
  /** ISO timestamp */
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function plausibilityBand(score: number): CausalVerdict["plausibilityBand"] {
  if (score >= 80) return "very_high";
  if (score >= 65) return "high";
  if (score >= 45) return "moderate";
  if (score >= 25) return "low";
  return "very_low";
}

function formatPhysicsContext(physics: Stage7Output): string {
  return [
    `Impact direction: ${physics.impactVector?.direction ?? "unknown"}`,
    `Impact force: ${physics.impactForceKn?.toFixed(1) ?? "N/A"} kN`,
    `Estimated speed at impact: ${physics.estimatedSpeedKmh?.toFixed(1) ?? "N/A"} km/h`,
    `Delta-V: ${physics.deltaVKmh?.toFixed(1) ?? "N/A"} km/h`,
    `Deceleration: ${physics.decelerationG?.toFixed(2) ?? "N/A"} G`,
    `Accident severity: ${physics.accidentSeverity ?? "unknown"}`,
    `Damage consistency score: ${physics.damageConsistencyScore ?? "N/A"}/100`,
    `Physics reconstruction: ${physics.accidentReconstructionSummary ?? "Not available"}`,
  ].join("\n");
}

function formatDamageContext(damage: Stage6Output): string {
  const parts = damage.damagedParts?.slice(0, 15).map(p => `${p.name} (${p.location ?? "unknown zone"}, severity: ${p.severity ?? "unknown"})`).join(", ") ?? "No components listed";
  const zones = damage.damageZones?.map(z => `${z.zone}: ${z.maxSeverity}`).join(", ") ?? "No zones";
  return `Damaged components: ${parts}\nDamage zones: ${zones}\nStructural damage detected: ${damage.structuralDamageDetected ? "Yes" : "No"}`;
}

function formatEnrichedPhotos(enrichedPhotosJson: string | null): { text: string; imageUrls: string[] } {
  if (!enrichedPhotosJson) return { text: "No damage photos available.", imageUrls: [] };
  try {
    const photos = JSON.parse(enrichedPhotosJson);
    if (!Array.isArray(photos) || photos.length === 0) return { text: "No damage photos available.", imageUrls: [] };
    const imageUrls: string[] = [];
    const descriptions: string[] = [];
    for (const p of photos.slice(0, 6)) { // Cap at 6 photos to stay within token limits
      const url = p.url || p.imageUrl || "";
      if (url) imageUrls.push(url);
      descriptions.push(
        `Photo ${imageUrls.length}: zone=${p.impactZone ?? "unknown"}, components=[${(p.detectedComponents ?? []).join(", ")}], severity=${p.severity ?? "unknown"}, confidence=${p.confidenceScore ?? "?"}%`
      );
    }
    return { text: descriptions.join("\n"), imageUrls };
  } catch {
    return { text: "Photo data could not be parsed.", imageUrls: [] };
  }
}

function buildFallbackVerdict(
  claimRecord: ClaimRecord,
  physics: Stage7Output | null,
  damage: Stage6Output | null
): CausalVerdict {
  const direction = physics?.impactVector?.direction ?? claimRecord.accidentDetails?.collisionDirection ?? "unknown";
  const description = claimRecord.accidentDetails?.description ?? "Not provided";
  const score = physics?.damageConsistencyScore ?? 50;
  return {
    inferredCause: description.length > 10 ? `Based on claimant description: ${description.substring(0, 120)}` : "Cause not determinable from available data",
    plausibilityScore: score,
    plausibilityBand: plausibilityBand(score),
    inferredCollisionDirection: direction as CollisionDirection,
    physicsAlignment: physics?.physicsExecuted ? "partially_consistent" : "not_applicable",
    imageAlignment: "no_photos",
    supportingEvidence: [],
    contradictions: [],
    narrativeVerdict: "Causal reasoning engine could not complete LLM analysis. Manual adjuster review is recommended.",
    flagForFraud: false,
    fraudFlagReason: null,
    reasoningTrace: "LLM call failed; keyword fallback applied.",
    llmUsed: false,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Causal Reasoning Engine.
 *
 * Reads the incident description, damage photos, physics output, and damage
 * components, then uses a multimodal LLM to reason about whether the described
 * cause is consistent with the observed evidence — and produces a structured
 * verdict with supporting evidence, contradictions, and a narrative conclusion.
 */
export async function runCausalReasoningEngine(
  claimRecord: ClaimRecord,
  damage: Stage6Output | null,
  physics: Stage7Output | null,
  enrichedPhotosJson: string | null
): Promise<CausalVerdict> {
  const description = claimRecord.accidentDetails?.description ?? "";
  const vehicleInfo = `${claimRecord.vehicle?.year ?? ""} ${claimRecord.vehicle?.make ?? ""} ${claimRecord.vehicle?.model ?? ""}`.trim() || "Unknown vehicle";
  const massKg = claimRecord.vehicle?.massKg ?? null;

  // Build context blocks
  const physicsContext = physics ? formatPhysicsContext(physics) : "Physics analysis not available (non-collision or engine skipped).";
  const damageContext = damage ? formatDamageContext(damage) : "Damage analysis not available.";
  const { text: photoContext, imageUrls } = formatEnrichedPhotos(enrichedPhotosJson);

  const systemPrompt = `You are a forensic vehicle incident analyst.

You MUST:
- Base conclusions ONLY on provided evidence (description, physics output, damage component list, photos)
- Explicitly identify every contradiction between sources — do not smooth over them in the narrative
- Assign conservative confidence scores — prefer a lower score when evidence is ambiguous or incomplete
- Prefer "uncertain" over incorrect certainty — if the cause cannot be determined from the evidence, say so
- Treat any collision with a living being (animal, pedestrian, cyclist) as a physical impact event subject to physics analysis
- Apply physics constraints strictly:
  * Low-speed impacts (< 20 km/h) produce surface damage only — deep structural damage at low speed is a contradiction
  * High-speed impacts (> 80 km/h) must show airbag deployment, frame deformation, and significant energy dissipation
  * Rear damage cannot result from a frontal collision unless the vehicle spun or rolled — this is a contradiction
  * Side damage on the driver side from a "head-on" description is a contradiction
  * Damage to components outside the stated impact zone is a contradiction, not incidental
  * Multiple separate damage zones from a single impact are only plausible if rotation or rollover is evidenced

You MUST NOT:
- Invent evidence that is not present in the provided data
- Ignore or downplay physics outputs that conflict with the claimant's account
- Overwrite contradictions with narrative smoothing — contradictions must appear in the contradictions array AND reduce the plausibilityScore
- Assign a plausibilityScore above 60 when any major or critical contradiction exists
- Assign a plausibilityScore above 80 when any moderate contradiction exists
- Present assumptions as facts

If evidence conflicts:
- Highlight the conflict explicitly in the contradictions array
- Reduce the plausibilityScore proportionally to the severity of the conflict
- Reflect the conflict in the narrativeVerdict without minimising it
- Set flagForFraud to true if any contradiction is major or critical and cannot be explained by the physics

Scoring guidance:
- 85–100: All sources fully consistent, physics matches description, photos confirm damage zone
- 65–84: Minor inconsistencies only, no structural contradictions
- 45–64: Moderate contradictions present — claim is plausible but requires adjuster review
- 25–44: Major contradictions — claim is unlikely as described, investigation recommended
- 0–24: Critical contradictions — claim is implausible, fraud flag required

Return ONLY valid JSON. No markdown, no text outside the JSON object.`;

  const userPrompt = `CLAIM ANALYSIS REQUEST

Vehicle: ${vehicleInfo}${massKg ? ` (${massKg} kg)` : ""}

CLAIMANT'S ACCOUNT:
"${description || "No incident description provided."}"

PHYSICS RECONSTRUCTION:
${physicsContext}

DAMAGE COMPONENTS & ZONES:
${damageContext}

DAMAGE PHOTOGRAPHS (AI-analysed):
${photoContext}

Please perform a full causal reasoning analysis and return the structured verdict.`;

  const jsonSchema = {
    type: "json_schema" as const,
    json_schema: {
      name: "causal_verdict",
      strict: true,
      schema: {
        type: "object",
        properties: {
          inferredCause: { type: "string", description: "The most likely true cause of the damage, in one clear sentence" },
          plausibilityScore: { type: "integer", description: "How plausible is the claimant's account given all evidence, 0-100" },
          inferredCollisionDirection: { type: "string", description: "frontal | rear | side_driver | side_passenger | rollover | multi_impact | unknown" },
          physicsAlignment: { type: "string", description: "consistent | partially_consistent | inconsistent | not_applicable" },
          imageAlignment: { type: "string", description: "consistent | partially_consistent | inconsistent | no_photos" },
          supportingEvidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string" },
                finding: { type: "string" },
                supports_claim: { type: "boolean" },
                confidence: { type: "integer" },
              },
              required: ["source", "finding", "supports_claim", "confidence"],
              additionalProperties: false,
            },
          },
          contradictions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_a: { type: "string" },
                source_b: { type: "string" },
                description: { type: "string" },
                severity: { type: "string" },
                implication: { type: "string" },
              },
              required: ["source_a", "source_b", "description", "severity", "implication"],
              additionalProperties: false,
            },
          },
          narrativeVerdict: { type: "string", description: "Adjuster-style narrative verdict paragraph (3-5 sentences)" },
          flagForFraud: { type: "boolean", description: "Whether this verdict warrants a fraud investigation flag" },
          fraudFlagReason: { type: "string", description: "Reason for fraud flag, or empty string if not flagged" },
          reasoningTrace: { type: "string", description: "One paragraph summarising the reasoning process" },
        },
        required: [
          "inferredCause", "plausibilityScore", "inferredCollisionDirection",
          "physicsAlignment", "imageAlignment", "supportingEvidence",
          "contradictions", "narrativeVerdict", "flagForFraud",
          "fraudFlagReason", "reasoningTrace",
        ],
        additionalProperties: false,
      },
    },
  };

  try {
    // Build the message — include photo images if available (multimodal)
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "auto" } };

    const contentParts: ContentPart[] = [{ type: "text", text: userPrompt }];
    for (const url of imageUrls.slice(0, 4)) { // Cap at 4 images for token budget
      contentParts.push({ type: "image_url", image_url: { url, detail: "auto" } });
    }

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contentParts },
      ],
      response_format: jsonSchema,
    });

    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : (rawContent != null ? JSON.stringify(rawContent) : "{}");
    const parsed = JSON.parse(content);

    // Validate and normalise
    const validDirections: CollisionDirection[] = ["frontal", "rear", "side_driver", "side_passenger", "rollover", "multi_impact", "unknown"];
    const validPhysicsAlignment = ["consistent", "partially_consistent", "inconsistent", "not_applicable"];
    const validImageAlignment = ["consistent", "partially_consistent", "inconsistent", "no_photos"];

    const score = typeof parsed.plausibilityScore === "number"
      ? Math.min(100, Math.max(0, parsed.plausibilityScore))
      : 50;

    return {
      inferredCause: parsed.inferredCause || "Could not determine cause",
      plausibilityScore: score,
      plausibilityBand: plausibilityBand(score),
      inferredCollisionDirection: validDirections.includes(parsed.inferredCollisionDirection)
        ? parsed.inferredCollisionDirection
        : "unknown",
      physicsAlignment: validPhysicsAlignment.includes(parsed.physicsAlignment)
        ? parsed.physicsAlignment
        : "not_applicable",
      imageAlignment: validImageAlignment.includes(parsed.imageAlignment)
        ? parsed.imageAlignment
        : "no_photos",
      supportingEvidence: Array.isArray(parsed.supportingEvidence) ? parsed.supportingEvidence : [],
      contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
      narrativeVerdict: parsed.narrativeVerdict || "No verdict generated.",
      flagForFraud: typeof parsed.flagForFraud === "boolean" ? parsed.flagForFraud : false,
      fraudFlagReason: parsed.fraudFlagReason || null,
      reasoningTrace: parsed.reasoningTrace || "",
      llmUsed: true,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // LLM failed — return safe fallback
    return buildFallbackVerdict(claimRecord, physics, damage);
  }
}
