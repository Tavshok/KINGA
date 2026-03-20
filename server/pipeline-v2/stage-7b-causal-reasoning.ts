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
  /** At least 2 alternative explanations for the damage, with plausibility scores */
  alternativeCauses: AlternativeCause[];
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
  /** Physics constraint validation results */
  constraintValidation: ConstraintValidation | null;
  /** ISO timestamp */
  generatedAt: string;
}

export interface AlternativeCause {
  cause: string;
  plausibilityScore: number; // 0–100
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Physics Constraint Validation Layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A structural physics constraint that MUST be true for a given incident cause.
 * Defined by the forensic mechanical analyst LLM call before the main verdict.
 */
export interface PhysicsConstraint {
  /** Unique identifier for this constraint */
  id: string;
  /** Plain-English description of the required physical condition */
  description: string;
  /** The type of constraint being checked */
  type: "damage_location" | "damage_absence" | "physics_direction" | "physics_range" | "damage_pattern";
  /** The expected value or condition that must be present */
  expectedValue: string;
  /** How critical this constraint is to the causal hypothesis */
  severity: "critical" | "major" | "moderate" | "minor";
}

/** Result of checking a single constraint against the actual evidence */
export interface ConstraintCheckResult {
  constraint: PhysicsConstraint;
  /** Whether the constraint is satisfied by the actual evidence */
  satisfied: boolean;
  /** What was actually observed in the evidence */
  actualValue: string;
  /** Confidence in this check result (0–100) */
  confidence: number;
}

/** Summary of all constraint checks for a causal hypothesis */
export interface ConstraintValidation {
  constraints: PhysicsConstraint[];
  results: ConstraintCheckResult[];
  /** Number of constraints that failed */
  failedCount: number;
  /** Number of critical constraints that failed */
  criticalFailures: number;
  /** Score penalty applied to plausibility based on constraint failures (0–100) */
  penaltyApplied: number;
}

/** Optional precomputed scores passed into the engine for richer context */
export interface PrecomputedScores {
  damageConsistencyScore?: number | null;
  fraudRiskScore?: number | null;
  fraudRiskLevel?: string | null;
  fraudIndicators?: string[];
  quoteDeviationPct?: number | null;
  repairToValueRatio?: number | null;
  estimatedCostCents?: number | null;
  currency?: string | null;
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
    alternativeCauses: [],
    narrativeVerdict: "Causal reasoning engine could not complete LLM analysis. Manual adjuster review is recommended.",
    flagForFraud: false,
    fraudFlagReason: null,
    reasoningTrace: "LLM call failed; keyword fallback applied.",
    llmUsed: false,
    constraintValidation: null,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraint Definition — Forensic Mechanical Analyst
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls the LLM as a forensic mechanical analyst to define the physical and
 * structural conditions that MUST be true for the given incident cause to be valid.
 * Returns an empty list if the cause is ambiguous.
 */
async function definePhysicsConstraints(
  inferredCause: string,
  collisionDirection: string,
  vehicleInfo: string,
  physicsContext: string
): Promise<PhysicsConstraint[]> {
  const constraintSystemPrompt = `You are a forensic mechanical analyst.

Your task is to define the physical and structural conditions that MUST be true for a given incident cause to be valid.

Rules:
- Only include conditions that are physically necessary
- Do NOT include optional or probabilistic observations
- Focus on impact direction, damage location, and structural response
- Be precise and minimal
- Do not explain, only define constraints

Each constraint must include:
- id (short snake_case string)
- description (one sentence, what must be physically true)
- type (damage_location | damage_absence | physics_direction | physics_range | damage_pattern)
- expectedValue (precise, measurable or observable condition)
- severity (critical | major | moderate | minor)

If the cause is ambiguous, return an empty constraints array.

Return ONLY valid JSON. No markdown, no text outside the JSON object.`;

  const constraintUserPrompt = `Vehicle: ${vehicleInfo}
Inferred cause: ${inferredCause}
Collision direction: ${collisionDirection}
Physics context:
${physicsContext}

Define the minimum set of physical constraints that MUST be satisfied for this cause to be valid.`;

  const constraintSchema = {
    type: "json_schema" as const,
    json_schema: {
      name: "physics_constraints",
      strict: true,
      schema: {
        type: "object",
        properties: {
          constraints: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                description: { type: "string" },
                type: { type: "string" },
                expectedValue: { type: "string" },
                severity: { type: "string" },
              },
              required: ["id", "description", "type", "expectedValue", "severity"],
              additionalProperties: false,
            },
          },
        },
        required: ["constraints"],
        additionalProperties: false,
      },
    },
  };

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: constraintSystemPrompt },
        { role: "user", content: constraintUserPrompt },
      ],
      response_format: constraintSchema,
    });
    const rawContent = response.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : (rawContent != null ? JSON.stringify(rawContent) : "{}");
    const parsed = JSON.parse(content);
    const validTypes = ["damage_location", "damage_absence", "physics_direction", "physics_range", "damage_pattern"];
    const validSeverities = ["critical", "major", "moderate", "minor"];
    return (Array.isArray(parsed.constraints) ? parsed.constraints : []).filter(
      (c: PhysicsConstraint) =>
        c.id && c.description && validTypes.includes(c.type) && c.expectedValue && validSeverities.includes(c.severity)
    );
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraint Checker — validates actual evidence against defined constraints
// ─────────────────────────────────────────────────────────────────────────────

function checkConstraints(
  constraints: PhysicsConstraint[],
  physics: Stage7Output | null,
  damage: Stage6Output | null
): ConstraintValidation {
  if (constraints.length === 0) {
    return { constraints: [], results: [], failedCount: 0, criticalFailures: 0, penaltyApplied: 0 };
  }

  const actualDirection = physics?.impactVector?.direction?.toLowerCase() ?? "unknown";
  const actualSpeedKmh = physics?.estimatedSpeedKmh ?? null;
  const actualForceKn = physics?.impactForceKn ?? null;
  const damagedZonesArr = (damage?.damageZones ?? []).map(z => z.zone?.toLowerCase() ?? "");
  const damagedComponentsArr = (damage?.damagedParts ?? []).map(p => (p.location ?? p.name ?? "").toLowerCase());
  const damagedZones = new Set<string>(damagedZonesArr);
  const damagedComponents = new Set<string>(damagedComponentsArr);

  const results: ConstraintCheckResult[] = constraints.map(c => {
    const expected = c.expectedValue.toLowerCase();
    let satisfied = false;
    let actualValue = "not determinable";
    let confidence = 60;

    switch (c.type) {
      case "physics_direction": {
        satisfied = actualDirection !== "unknown" && expected.includes(actualDirection);
        actualValue = `Impact direction: ${actualDirection}`;
        confidence = actualDirection !== "unknown" ? 90 : 30;
        break;
      }
      case "physics_range": {
        // Parse expected value like "speed > 20 km/h" or "force < 500 kN"
        const speedMatch = expected.match(/(speed|velocity)\s*([<>]=?)\s*(\d+)/);
        const forceMatch = expected.match(/force\s*([<>]=?)\s*(\d+)/);
        if (speedMatch && actualSpeedKmh !== null) {
          const op = speedMatch[2];
          const val = parseFloat(speedMatch[3]);
          satisfied = op === ">" ? actualSpeedKmh > val :
                      op === ">=" ? actualSpeedKmh >= val :
                      op === "<" ? actualSpeedKmh < val :
                      op === "<=" ? actualSpeedKmh <= val : false;
          actualValue = `Speed: ${actualSpeedKmh.toFixed(1)} km/h`;
          confidence = 85;
        } else if (forceMatch && actualForceKn !== null) {
          const op = forceMatch[1];
          const val = parseFloat(forceMatch[2]);
          satisfied = op === ">" ? actualForceKn > val :
                      op === ">=" ? actualForceKn >= val :
                      op === "<" ? actualForceKn < val :
                      op === "<=" ? actualForceKn <= val : false;
          actualValue = `Impact force: ${actualForceKn.toFixed(1)} kN`;
          confidence = 85;
        } else {
          satisfied = false;
          actualValue = "Physics data insufficient to evaluate range constraint";
          confidence = 20;
        }
        break;
      }
      case "damage_location": {
        // Check if any damaged zone or component matches the expected location
        const zoneMatch = damagedZonesArr.some(z => expected.includes(z) || z.includes(expected.split(" ")[0]));
        const compMatch = damagedComponentsArr.some(c2 => expected.includes(c2.split(" ")[0]) || c2.includes(expected.split(" ")[0]));
        satisfied = zoneMatch || compMatch;
        actualValue = damagedZones.size > 0 ? damagedZonesArr.join(", ") : "No damage zones recorded";
        actualValue = `Damaged zones: ${actualValue}`;
        confidence = damage ? 75 : 25;
        break;
      }
      case "damage_absence": {
        // Constraint requires that a specific zone is NOT damaged
        const zoneAbsent = !damagedZonesArr.some(z => expected.includes(z) || z.includes(expected.split(" ")[0]));
        const compAbsent = !damagedComponentsArr.some(c2 => expected.includes(c2.split(" ")[0]) || c2.includes(expected.split(" ")[0]));
        satisfied = zoneAbsent && compAbsent;
        actualValue = damagedZones.size > 0 ? `Damaged zones: ${damagedZonesArr.join(", ")}` : "No damage zones recorded";
        confidence = damage ? 70 : 25;
        break;
      }
      case "damage_pattern": {
        // Pattern constraints are evaluated at lower confidence — structural deformation, crumple zones etc.
        const structuralExpected = expected.includes("structural") || expected.includes("deform") || expected.includes("crumple");
        if (structuralExpected) {
          satisfied = damage?.structuralDamageDetected ?? false;
          actualValue = damage?.structuralDamageDetected ? "Structural damage detected" : "No structural damage detected";
          confidence = damage ? 70 : 20;
        } else {
          // Generic pattern — check component count as proxy for energy dissipation
          const componentCount = damage?.damagedParts?.length ?? 0;
          const highEnergy = expected.includes("multiple") || expected.includes("extensive");
          satisfied = highEnergy ? componentCount >= 5 : componentCount >= 1;
          actualValue = `${componentCount} damaged components recorded`;
          confidence = 60;
        }
        break;
      }
      default:
        satisfied = false;
        actualValue = "Unknown constraint type";
        confidence = 0;
    }

    return { constraint: c, satisfied, actualValue, confidence };
  });

  const failed = results.filter(r => !r.satisfied);
  const criticalFailures = failed.filter(r => r.constraint.severity === "critical").length;
  const majorFailures = failed.filter(r => r.constraint.severity === "major").length;
  const moderateFailures = failed.filter(r => r.constraint.severity === "moderate").length;
  const minorFailures = failed.filter(r => r.constraint.severity === "minor").length;

  // Penalty: critical=30, major=15, moderate=8, minor=3 — capped at 80
  const penaltyApplied = Math.min(
    80,
    criticalFailures * 30 + majorFailures * 15 + moderateFailures * 8 + minorFailures * 3
  );

  return {
    constraints,
    results,
    failedCount: failed.length,
    criticalFailures,
    penaltyApplied,
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
function formatScoringBlock(physics: Stage7Output | null, scores: PrecomputedScores | null): string {
  const lines: string[] = [];
  const physicsConsistency = physics?.damageConsistencyScore ?? scores?.damageConsistencyScore;
  if (physicsConsistency != null) lines.push(`Damage consistency score (physics engine): ${physicsConsistency}/100`);
  if (scores?.fraudRiskScore != null) lines.push(`Fraud risk score (pre-computed): ${scores.fraudRiskScore}/100 (${scores.fraudRiskLevel ?? "unknown"})`);
  if (scores?.fraudIndicators && scores.fraudIndicators.length > 0) lines.push(`Fraud indicators raised: ${scores.fraudIndicators.join("; ")}`);
  if (scores?.quoteDeviationPct != null) lines.push(`Quote deviation from AI estimate: ${scores.quoteDeviationPct > 0 ? "+" : ""}${scores.quoteDeviationPct.toFixed(1)}%`);
  if (scores?.repairToValueRatio != null) lines.push(`Repair-to-value ratio: ${(scores.repairToValueRatio * 100).toFixed(1)}%`);
  if (scores?.estimatedCostCents != null && scores.currency) {
    const amount = (scores.estimatedCostCents / 100).toFixed(2);
    lines.push(`AI estimated repair cost: ${scores.currency} ${amount}`);
  }
  return lines.length > 0 ? lines.join("\n") : "No precomputed scores available.";
}

export async function runCausalReasoningEngine(
  claimRecord: ClaimRecord,
  damage: Stage6Output | null,
  physics: Stage7Output | null,
  enrichedPhotosJson: string | null,
  precomputedScores?: PrecomputedScores | null
): Promise<CausalVerdict> {
  const description = claimRecord.accidentDetails?.description ?? "";
  const vehicleInfo = `${claimRecord.vehicle?.year ?? ""} ${claimRecord.vehicle?.make ?? ""} ${claimRecord.vehicle?.model ?? ""}`.trim() || "Unknown vehicle";
  const massKg = claimRecord.vehicle?.massKg ?? null;

  // Build context blocks
  const physicsContext = physics ? formatPhysicsContext(physics) : "Physics analysis not available (non-collision or engine skipped).";
  const damageContext = damage ? formatDamageContext(damage) : "Damage analysis not available.";
  const { text: photoContext, imageUrls } = formatEnrichedPhotos(enrichedPhotosJson);
  const scoringBlock = formatScoringBlock(physics, precomputedScores ?? null);

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

  const userPrompt = `Vehicle: ${vehicleInfo}${massKg ? ` (${massKg} kg)` : ""}

INPUT:

1. Incident Description:
${description || "No incident description provided."}

2. Physics Output:
${physicsContext}

3. Image Analysis:
${photoContext}

4. Damage Components:
${damageContext}

5. Precomputed Scores:
${scoringBlock}

TASK:
Determine the most plausible cause of the incident.

RETURN:
- Inferred cause
- Plausibility score (0–100)
- Alignment across all sources
- Supporting evidence
- Contradictions (with severity)
- Alternative causes (at least 2)
- Fraud flag (if applicable)
- Adjuster narrative`;

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
          alternativeCauses: {
            type: "array",
            description: "At least 2 alternative explanations for the damage, each with a plausibility score and reasoning",
            items: {
              type: "object",
              properties: {
                cause: { type: "string" },
                plausibilityScore: { type: "integer" },
                reasoning: { type: "string" },
              },
              required: ["cause", "plausibilityScore", "reasoning"],
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
          "contradictions", "alternativeCauses", "narrativeVerdict", "flagForFraud",
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

    const llmScore = typeof parsed.plausibilityScore === "number"
      ? Math.min(100, Math.max(0, parsed.plausibilityScore))
      : 50;

    const inferredDirection = validDirections.includes(parsed.inferredCollisionDirection)
      ? parsed.inferredCollisionDirection as CollisionDirection
      : "unknown" as CollisionDirection;

    // ─────────────────────────────────────────────────────────────────────────────
    // CONSTRAINT VALIDATION LAYER
    // Ask the forensic mechanical analyst to define necessary physical constraints
    // for the inferred cause, then check them against the actual evidence.
    // ─────────────────────────────────────────────────────────────────────────────
    const inferredCause = parsed.inferredCause || "Could not determine cause";
    const constraints = await definePhysicsConstraints(
      inferredCause,
      inferredDirection,
      vehicleInfo,
      physicsContext
    );
    const constraintValidation = checkConstraints(constraints, physics, damage);

    // Apply constraint penalty to plausibility score
    const penalisedScore = Math.max(0, llmScore - constraintValidation.penaltyApplied);
    const finalScore = penalisedScore;

    // Convert failed constraints into additional contradictions
    const constraintContradictions: CausalContradiction[] = constraintValidation.results
      .filter(r => !r.satisfied)
      .map(r => ({
        source_a: "physics_constraint",
        source_b: "observed_damage",
        description: `Constraint "${r.constraint.id}" failed: ${r.constraint.description} Expected: ${r.constraint.expectedValue}. Observed: ${r.actualValue}.`,
        severity: r.constraint.severity,
        implication: `This constraint failure ${r.constraint.severity === "critical" || r.constraint.severity === "major" ? "undermines" : "weakens"} the causal hypothesis. Confidence in check: ${r.confidence}%.`,
      }));

    const allContradictions: CausalContradiction[] = [
      ...(Array.isArray(parsed.contradictions) ? parsed.contradictions : []),
      ...constraintContradictions,
    ];

    // Escalate fraud flag if critical constraint failures exist
    const hasCriticalConstraintFailure = constraintValidation.criticalFailures > 0;
    const fraudFlagged = (typeof parsed.flagForFraud === "boolean" ? parsed.flagForFraud : false) || hasCriticalConstraintFailure;
    const fraudReason = fraudFlagged
      ? (parsed.fraudFlagReason || (hasCriticalConstraintFailure ? `${constraintValidation.criticalFailures} critical physics constraint(s) failed, making the stated cause physically implausible.` : null))
      : null;

    return {
      inferredCause,
      plausibilityScore: finalScore,
      plausibilityBand: plausibilityBand(finalScore),
      inferredCollisionDirection: inferredDirection,
      physicsAlignment: validPhysicsAlignment.includes(parsed.physicsAlignment)
        ? parsed.physicsAlignment
        : "not_applicable",
      imageAlignment: validImageAlignment.includes(parsed.imageAlignment)
        ? parsed.imageAlignment
        : "no_photos",
      supportingEvidence: Array.isArray(parsed.supportingEvidence) ? parsed.supportingEvidence : [],
      contradictions: allContradictions,
      alternativeCauses: Array.isArray(parsed.alternativeCauses) ? parsed.alternativeCauses : [],
      narrativeVerdict: parsed.narrativeVerdict || "No verdict generated.",
      flagForFraud: fraudFlagged,
      fraudFlagReason: fraudReason,
      reasoningTrace: parsed.reasoningTrace || "",
      llmUsed: true,
      constraintValidation,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    // LLM failed — return safe fallback
    return buildFallbackVerdict(claimRecord, physics, damage);
  }
}
