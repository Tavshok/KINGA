/**
 * incidentNarrativeEngine.ts
 *
 * PURPOSE
 * -------
 * Transforms the raw incident description from a claim form into a structured,
 * reasoned NarrativeAnalysis. This engine:
 *
 *   1. SEPARATES the actual incident narrative from post-incident content
 *      (stripping, inspection findings, extras quotations, seatbelt checks,
 *      reprogramming notes, omitted damage discoveries, etc.)
 *
 *   2. REASONS over the cleaned narrative to extract key facts:
 *      - Sequence of events (pre-impact → impact → post-impact)
 *      - Implied speed, direction, and force signals
 *      - Environmental context (road, time, visibility, weather)
 *      - Animal/object/vehicle involvement
 *
 *   3. CROSS-VALIDATES the narrative against:
 *      - Physics engine output (plausibility score, delta-V, impact force)
 *      - AI vision analysis (damage zones, severity)
 *      - Crush depth / structural damage flags
 *      - Damage component list (are claimed damages consistent with the story?)
 *
 *   4. PRODUCES fraud signals from narrative inconsistencies:
 *      - Narrative contradicts physics (e.g. "minor bump" at 90 km/h)
 *      - Narrative mentions pre-existing damage as incident damage
 *      - Narrative is suspiciously vague or templated
 *      - Post-incident actions described as part of the incident
 *      - Damage list includes items not mentioned in narrative
 *
 * OUTPUT: NarrativeAnalysis — stored on ClaimRecord.accidentDetails and
 * consumed by stage-8 fraud engine and ForensicAuditReport Section 1.
 */

import { invokeLLM } from "../_core/llm";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type NarrativeConsistencyVerdict =
  | "CONSISTENT"        // Narrative aligns with physics, vision, and damage
  | "MINOR_DISCREPANCY" // Small gaps but no fraud signal
  | "INCONSISTENT"      // Clear mismatch between narrative and evidence
  | "INSUFFICIENT_DATA" // Not enough information to assess
  | "CONTAMINATED";     // Narrative contains post-incident content mixed in

export interface NarrativeSegment {
  /** The cleaned text of this segment */
  text: string;
  /** Whether this segment describes the actual incident */
  isIncident: boolean;
  /** Why this segment was classified as incident or post-incident */
  classification_reason: string;
}

export interface NarrativeFraudSignal {
  code: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  score_contribution: number;
  evidence: string;
}

export interface NarrativeCrossValidation {
  /** Physics plausibility verdict based on narrative speed/force claims */
  physics_verdict: "CONSISTENT" | "INCONSISTENT" | "NOT_ASSESSED";
  physics_notes: string;
  /** Vision/damage verdict: do described damages match the narrative? */
  damage_verdict: "CONSISTENT" | "INCONSISTENT" | "PARTIAL" | "NOT_ASSESSED";
  damage_notes: string;
  /** Crush depth verdict: does structural damage claim match narrative force? */
  crush_depth_verdict: "CONSISTENT" | "INCONSISTENT" | "NOT_ASSESSED";
  crush_depth_notes: string;
}

export interface NarrativeAnalysis {
  /** The raw text as extracted from the claim form (unmodified) */
  raw_description: string;
  /** The cleaned incident-only narrative (post-incident content removed) */
  cleaned_incident_narrative: string;
  /** Post-incident content that was stripped out */
  stripped_content: string[];
  /** Whether the raw description contained post-incident contamination */
  was_contaminated: boolean;
  /** Structured segments with classification */
  segments: NarrativeSegment[];
  /** Key facts extracted by reasoning over the narrative */
  extracted_facts: {
    implied_speed_kmh: number | null;
    implied_direction: string | null;
    implied_severity: "minor" | "moderate" | "severe" | "catastrophic" | null;
    animal_mentioned: boolean;
    animal_type: string | null;
    third_party_involved: boolean;
    road_condition_mentioned: boolean;
    time_of_day_mentioned: boolean;
    police_mentioned: boolean;
    evasive_action_taken: boolean;
    sequence_of_events: string; // 1-3 sentence summary
  };
  /** Cross-validation results against physics, vision, and damage */
  cross_validation: NarrativeCrossValidation;
  /** Fraud signals derived from narrative analysis */
  fraud_signals: NarrativeFraudSignal[];
  /** Overall narrative consistency verdict */
  consistency_verdict: NarrativeConsistencyVerdict;
  /** Human-readable reasoning summary for the adjuster */
  reasoning_summary: string;
  /** Confidence in this analysis (0-100) */
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

export interface NarrativeEngineInput {
  /** Raw incident description from the claim form */
  raw_description: string;
  /** Incident type (animal_strike, collision, theft, etc.) */
  incident_type: string;
  /** Claimed speed at time of incident */
  claimed_speed_kmh: number | null;
  /** Physics engine plausibility score (0-100), null if not run */
  physics_plausibility_score: number | null;
  /** Physics engine delta-V (km/h), null if not run */
  physics_delta_v_kmh: number | null;
  /** Physics engine impact force (kN), null if not run */
  physics_impact_force_kn: number | null;
  /** Whether structural damage was detected */
  structural_damage: boolean;
  /** Whether airbag deployment was reported */
  airbag_deployment: boolean;
  /** Crush depth in metres, null if not measured */
  crush_depth_m: number | null;
  /** Damage components from stage-6 analysis */
  damage_components: Array<{ name: string; severity: string; location: string }>;
  /** AI vision analysis summary (from photo analysis), null if no photos */
  vision_summary: string | null;
  /** Vehicle make/model for context */
  vehicle_make_model: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-INCIDENT PATTERN DETECTION (fast regex pre-pass)
// ─────────────────────────────────────────────────────────────────────────────

const POST_INCIDENT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /the vehicle was stripped[^.]*\./gi, label: "stripping note" },
  { pattern: /stripped (?:in order|to identify|for inspection)[^.]*\./gi, label: "stripping note" },
  { pattern: /we inspected[^.]*\./gi, label: "inspection finding" },
  { pattern: /after (?:final )?inspection[^.]*\./gi, label: "post-inspection note" },
  { pattern: /we noted that[^.]*\./gi, label: "inspection finding" },
  { pattern: /the repairer omitted[^.]*\./gi, label: "repair omission note" },
  { pattern: /omitted (?:initially|from the original)[^.]*\./gi, label: "repair omission note" },
  { pattern: /hence all costs[^.]*\./gi, label: "cost justification" },
  { pattern: /hence the repairer[^.]*\./gi, label: "repairer instruction" },
  { pattern: /extras quotation[^.]*\./gi, label: "extras quotation note" },
  { pattern: /additional pictures[^.]*\./gi, label: "photo submission note" },
  { pattern: /after (?:the )?(?:vehicle['s]? )?repairs? (?:were )?completed[^.]*\./gi, label: "post-repair note" },
  { pattern: /submitted extras[^.]*\./gi, label: "extras submission" },
  { pattern: /in order to identify omitted damages[^.]*\./gi, label: "damage discovery note" },
  { pattern: /by verifying all stated damages[^.]*\./gi, label: "damage verification note" },
  { pattern: /reprogramming (?:are )?included[^.]*\./gi, label: "reprogramming note" },
  { pattern: /seatbelt[s]? (?:and|were|was|are)[^.]*\./gi, label: "seatbelt note" },
  { pattern: /for seatbelt[^.]*\./gi, label: "seatbelt note" },
  { pattern: /upon (?:further )?(?:stripping|dismantling|inspection)[^.]*\./gi, label: "stripping/inspection note" },
  { pattern: /during (?:stripping|dismantling|repair)[^.]*\./gi, label: "repair process note" },
  { pattern: /found (?:additional|further|more) damage[^.]*\./gi, label: "additional damage discovery" },
  { pattern: /discovered (?:additional|hidden|further)[^.]*\./gi, label: "hidden damage discovery" },
  { pattern: /supplement(?:al|ary)? (?:claim|quote|invoice)[^.]*\./gi, label: "supplemental claim note" },
  { pattern: /the (?:assessor|surveyor|inspector) (?:noted|found|observed)[^.]*\./gi, label: "assessor observation" },
];

function detectPostIncidentContent(text: string): { stripped: string[]; cleaned: string } {
  const stripped: string[] = [];
  let cleaned = text;
  for (const { pattern, label } of POST_INCIDENT_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        stripped.push(`[${label}] ${m.trim()}`);
      }
      cleaned = cleaned.replace(pattern, " ");
    }
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return { stripped, cleaned };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM REASONING PASS
// ─────────────────────────────────────────────────────────────────────────────

async function runLLMReasoningPass(
  input: NarrativeEngineInput,
  preCleanedNarrative: string,
  strippedContent: string[]
): Promise<Omit<NarrativeAnalysis, "raw_description" | "stripped_content" | "was_contaminated">> {
  const physicsContext = input.physics_plausibility_score != null
    ? `Physics engine: plausibility=${input.physics_plausibility_score}/100, delta-V=${input.physics_delta_v_kmh ?? "N/A"} km/h, impact force=${input.physics_impact_force_kn ?? "N/A"} kN.`
    : "Physics engine: not run.";

  const damageContext = input.damage_components.length > 0
    ? `Damage components (${input.damage_components.length}): ${input.damage_components.slice(0, 10).map(d => `${d.name} (${d.severity}, ${d.location})`).join("; ")}.`
    : "No damage components extracted.";

  const visionContext = input.vision_summary
    ? `AI vision analysis: ${input.vision_summary}`
    : "AI vision analysis: not available.";

  const crushContext = input.crush_depth_m != null
    ? `Crush depth: ${input.crush_depth_m}m. Structural damage: ${input.structural_damage}. Airbag deployment: ${input.airbag_deployment}.`
    : `Structural damage: ${input.structural_damage}. Airbag deployment: ${input.airbag_deployment}.`;

  const prompt = `You are a forensic insurance claims analyst specialising in motor vehicle incidents. Your task is to reason over an incident description from a claim form and produce a structured analysis.

CLAIM CONTEXT
-------------
Vehicle: ${input.vehicle_make_model}
Incident type: ${input.incident_type}
Claimed speed: ${input.claimed_speed_kmh != null ? `${input.claimed_speed_kmh} km/h` : "not stated"}
${physicsContext}
${crushContext}
${damageContext}
${visionContext}

RAW INCIDENT DESCRIPTION (from claim form)
------------------------------------------
${input.raw_description}

PRE-CLEANED NARRATIVE (post-incident content already stripped by regex)
-----------------------------------------------------------------------
${preCleanedNarrative}

STRIPPED CONTENT (identified as post-incident by regex)
-------------------------------------------------------
${strippedContent.length > 0 ? strippedContent.join("\n") : "None detected by regex."}

YOUR TASKS
----------
1. SEGMENT the raw description into incident vs post-incident parts. The regex pre-pass may have missed some. Look for:
   - Inspection findings ("we found", "upon stripping", "after dismantling")
   - Repair process notes ("the repairer", "the panel beater", "during repairs")
   - Supplemental damage discoveries ("additional damages found", "omitted from original quote")
   - Cost justifications ("hence the cost", "therefore all costs")
   - Administrative notes (seatbelt checks, reprogramming, calibration)

2. EXTRACT key facts from the incident narrative only:
   - What happened step by step (sequence of events)
   - Implied speed (even if not stated — infer from severity language)
   - Direction of impact
   - Implied severity
   - Whether animal/third party was involved
   - Whether evasive action was taken
   - Environmental context

3. CROSS-VALIDATE the narrative against the physics/damage/vision data:
   - Does the narrative speed/severity claim match the physics plausibility score?
   - Do the described damages match what the narrative implies should be damaged?
   - Does the crush depth/structural damage claim match the narrative force description?
   - Flag any contradictions as fraud signals.

4. IDENTIFY fraud signals from the narrative:
   - "NARRATIVE_PHYSICS_MISMATCH": narrative implies minor impact but physics shows high force (or vice versa)
   - "NARRATIVE_VAGUE_OR_TEMPLATED": description is suspiciously generic, lacks specific details
   - "NARRATIVE_DAMAGE_MISMATCH": narrative describes one impact zone but damage list shows another
   - "NARRATIVE_SPEED_INCONSISTENCY": stated speed inconsistent with described damage severity
   - "NARRATIVE_PRE_EXISTING_DAMAGE": narrative may be describing pre-existing damage as incident damage
   - "NARRATIVE_CONTAMINATED_COST": post-incident cost justifications mixed into incident description
   - "NARRATIVE_MISSING_KEY_FACTS": critical facts (location, time, sequence) suspiciously absent

5. PRODUCE a reasoning summary for the adjuster (2-4 sentences, professional tone, factual).

Return ONLY valid JSON matching this exact schema:
{
  "cleaned_incident_narrative": "string — the incident-only narrative, post-incident content removed, written in clear professional English",
  "segments": [
    {
      "text": "string",
      "isIncident": true/false,
      "classification_reason": "string"
    }
  ],
  "extracted_facts": {
    "implied_speed_kmh": number or null,
    "implied_direction": "front" | "rear" | "side" | "rollover" | "unknown" or null,
    "implied_severity": "minor" | "moderate" | "severe" | "catastrophic" or null,
    "animal_mentioned": true/false,
    "animal_type": "string or null",
    "third_party_involved": true/false,
    "road_condition_mentioned": true/false,
    "time_of_day_mentioned": true/false,
    "police_mentioned": true/false,
    "evasive_action_taken": true/false,
    "sequence_of_events": "string — 1-3 sentence summary of what happened"
  },
  "cross_validation": {
    "physics_verdict": "CONSISTENT" | "INCONSISTENT" | "NOT_ASSESSED",
    "physics_notes": "string",
    "damage_verdict": "CONSISTENT" | "INCONSISTENT" | "PARTIAL" | "NOT_ASSESSED",
    "damage_notes": "string",
    "crush_depth_verdict": "CONSISTENT" | "INCONSISTENT" | "NOT_ASSESSED",
    "crush_depth_notes": "string"
  },
  "fraud_signals": [
    {
      "code": "string",
      "description": "string",
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "score_contribution": number (0-25),
      "evidence": "string — specific text from the narrative that triggered this signal"
    }
  ],
  "consistency_verdict": "CONSISTENT" | "MINOR_DISCREPANCY" | "INCONSISTENT" | "INSUFFICIENT_DATA" | "CONTAMINATED",
  "reasoning_summary": "string",
  "confidence": number (0-100)
}`;

  let parsed: any = null;
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a forensic insurance claims analyst. Return only valid JSON. No markdown, no explanation outside the JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "narrative_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              cleaned_incident_narrative: { type: "string" },
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    isIncident: { type: "boolean" },
                    classification_reason: { type: "string" },
                  },
                  required: ["text", "isIncident", "classification_reason"],
                  additionalProperties: false,
                },
              },
              extracted_facts: {
                type: "object",
                properties: {
                  implied_speed_kmh: { type: ["number", "null"] },
                  implied_direction: { type: ["string", "null"] },
                  implied_severity: { type: ["string", "null"] },
                  animal_mentioned: { type: "boolean" },
                  animal_type: { type: ["string", "null"] },
                  third_party_involved: { type: "boolean" },
                  road_condition_mentioned: { type: "boolean" },
                  time_of_day_mentioned: { type: "boolean" },
                  police_mentioned: { type: "boolean" },
                  evasive_action_taken: { type: "boolean" },
                  sequence_of_events: { type: "string" },
                },
                required: [
                  "implied_speed_kmh", "implied_direction", "implied_severity",
                  "animal_mentioned", "animal_type", "third_party_involved",
                  "road_condition_mentioned", "time_of_day_mentioned",
                  "police_mentioned", "evasive_action_taken", "sequence_of_events",
                ],
                additionalProperties: false,
              },
              cross_validation: {
                type: "object",
                properties: {
                  physics_verdict: { type: "string" },
                  physics_notes: { type: "string" },
                  damage_verdict: { type: "string" },
                  damage_notes: { type: "string" },
                  crush_depth_verdict: { type: "string" },
                  crush_depth_notes: { type: "string" },
                },
                required: [
                  "physics_verdict", "physics_notes",
                  "damage_verdict", "damage_notes",
                  "crush_depth_verdict", "crush_depth_notes",
                ],
                additionalProperties: false,
              },
              fraud_signals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    code: { type: "string" },
                    description: { type: "string" },
                    severity: { type: "string" },
                    score_contribution: { type: "number" },
                    evidence: { type: "string" },
                  },
                  required: ["code", "description", "severity", "score_contribution", "evidence"],
                  additionalProperties: false,
                },
              },
              consistency_verdict: { type: "string" },
              reasoning_summary: { type: "string" },
              confidence: { type: "number" },
            },
            required: [
              "cleaned_incident_narrative", "segments", "extracted_facts",
              "cross_validation", "fraud_signals", "consistency_verdict",
              "reasoning_summary", "confidence",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response?.choices?.[0]?.message?.content;
    if (content) {
      parsed = typeof content === "string" ? JSON.parse(content) : content;
    }
  } catch (err) {
    // LLM failure — return a degraded but safe result
    return buildDegradedResult(preCleanedNarrative, strippedContent, err);
  }

  if (!parsed) {
    return buildDegradedResult(preCleanedNarrative, strippedContent, new Error("Empty LLM response"));
  }

  return {
    cleaned_incident_narrative: parsed.cleaned_incident_narrative ?? preCleanedNarrative,
    segments: parsed.segments ?? [],
    extracted_facts: parsed.extracted_facts ?? buildEmptyFacts(),
    cross_validation: parsed.cross_validation ?? buildEmptyCrossValidation(),
    fraud_signals: parsed.fraud_signals ?? [],
    consistency_verdict: parsed.consistency_verdict ?? "INSUFFICIENT_DATA",
    reasoning_summary: parsed.reasoning_summary ?? "Narrative analysis could not be completed.",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 50,
  };
}

function buildDegradedResult(
  preCleanedNarrative: string,
  strippedContent: string[],
  _err: unknown
): Omit<NarrativeAnalysis, "raw_description" | "stripped_content" | "was_contaminated"> {
  return {
    cleaned_incident_narrative: preCleanedNarrative,
    segments: [],
    extracted_facts: buildEmptyFacts(),
    cross_validation: buildEmptyCrossValidation(),
    fraud_signals: [],
    consistency_verdict: "INSUFFICIENT_DATA",
    reasoning_summary: "Narrative reasoning engine encountered an error. Manual review of the incident description is required.",
    confidence: 0,
  };
}

function buildEmptyFacts() {
  return {
    implied_speed_kmh: null,
    implied_direction: null,
    implied_severity: null,
    animal_mentioned: false,
    animal_type: null,
    third_party_involved: false,
    road_condition_mentioned: false,
    time_of_day_mentioned: false,
    police_mentioned: false,
    evasive_action_taken: false,
    sequence_of_events: "Insufficient data to reconstruct sequence of events.",
  };
}

function buildEmptyCrossValidation(): NarrativeCrossValidation {
  return {
    physics_verdict: "NOT_ASSESSED",
    physics_notes: "Physics engine data not available.",
    damage_verdict: "NOT_ASSESSED",
    damage_notes: "Damage data not available.",
    crush_depth_verdict: "NOT_ASSESSED",
    crush_depth_notes: "Crush depth data not available.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the incident narrative reasoning engine.
 *
 * @param input  All context needed for reasoning (description, physics, damage, vision)
 * @returns      Structured NarrativeAnalysis
 */
export async function runIncidentNarrativeEngine(
  input: NarrativeEngineInput
): Promise<NarrativeAnalysis> {
  const raw = (input.raw_description ?? "").trim();

  if (!raw || raw.length < 10) {
    return {
      raw_description: raw,
      cleaned_incident_narrative: "",
      stripped_content: [],
      was_contaminated: false,
      segments: [],
      extracted_facts: buildEmptyFacts(),
      cross_validation: buildEmptyCrossValidation(),
      fraud_signals: [],
      consistency_verdict: "INSUFFICIENT_DATA",
      reasoning_summary: "No incident description was provided in the claim form.",
      confidence: 0,
    };
  }

  // Step 1: Fast regex pre-pass to strip obvious post-incident content
  const { stripped, cleaned: preCleanedNarrative } = detectPostIncidentContent(raw);
  const wasContaminated = stripped.length > 0;

  // Step 2: LLM reasoning pass
  const llmResult = await runLLMReasoningPass(input, preCleanedNarrative, stripped);

  return {
    raw_description: raw,
    cleaned_incident_narrative: llmResult.cleaned_incident_narrative,
    stripped_content: stripped,
    was_contaminated: wasContaminated || llmResult.segments.some(s => !s.isIncident),
    segments: llmResult.segments,
    extracted_facts: llmResult.extracted_facts,
    cross_validation: llmResult.cross_validation,
    fraud_signals: llmResult.fraud_signals,
    consistency_verdict: llmResult.consistency_verdict,
    reasoning_summary: llmResult.reasoning_summary,
    confidence: llmResult.confidence,
  };
}
