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
  /** Multi-stakeholder analysis: who said what, where accounts agree or contradict, liability posture */
  stakeholder_analysis?: {
    /** Summary of the claimant's account */
    claimant_account: string;
    /** Summary of the third party's account (null if not available) */
    third_party_account: string | null;
    /** Summary of the police officer's findings (null if not available) */
    police_findings: string | null;
    /** Whether the claimant was charged at the scene */
    claimant_charged: boolean;
    /** Whether the third party was charged at the scene */
    third_party_charged: boolean;
    /** Whether the matter is under investigation (no charge yet) */
    under_investigation: boolean;
    /** Points where all available accounts agree */
    agreement_points: string[];
    /** Points where accounts contradict each other */
    contradiction_points: string[];
    /** Provisional liability posture based on all available evidence */
    liability_posture: "CLAIMANT_AT_FAULT" | "THIRD_PARTY_AT_FAULT" | "SHARED_FAULT" | "UNDETERMINED" | "UNDER_INVESTIGATION";
    /** Professional adjuster opinion (2-4 sentences) */
    adjuster_opinion: string;
    /** Confidence in the liability posture (0-100) */
    liability_confidence: number;
  };
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
  /** Who was charged at the scene (claimant name, third party name, or null) */
  police_charged_party?: string | null;
  /** Police investigation status: CHARGED | UNDER_INVESTIGATION | NO_CHARGE | CASE_WITHDRAWN | UNKNOWN */
  police_investigation_status?: string | null;
  /** Verbatim factual findings recorded by the attending officer */
  police_officer_findings?: string | null;
  /** Third party's own account of events, if present in the claim documents */
  third_party_account?: string | null;
  /** Collision scenario detected by Stage 5 */
  collision_scenario?: string | null;
  /** Whether the claimant is the struck party (not at fault) */
  is_struck_party?: boolean;
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

  // Build stakeholder context block
  const policeChargeContext = input.police_charged_party
    ? `Police charged: ${input.police_charged_party}`
    : input.police_investigation_status === 'UNDER_INVESTIGATION'
    ? 'Police status: Matter under investigation — no charge yet'
    : 'Police charge status: not stated';

  const policeOfficerContext = input.police_officer_findings
    ? `Officer findings: ${input.police_officer_findings}`
    : 'Officer findings: not recorded';

  const thirdPartyAccountContext = input.third_party_account
    ? `Third party account: ${input.third_party_account}`
    : 'Third party account: not available';

  const scenarioContext = input.collision_scenario
    ? `Collision scenario: ${input.collision_scenario}${input.is_struck_party ? ' (claimant is the STRUCK party)' : ''}`
    : '';

  const prompt = `You are a senior loss adjuster and forensic insurance claims analyst specialising in motor vehicle incidents. You have superhuman analytical abilities — you read every stakeholder's voice, cross-reference all evidence, and form a professional opinion. Your task is to reason over an incident description and all available stakeholder accounts to produce a structured analysis.

CRITICAL RULES — ANTI-FABRICATION CONTRACT
-------------------------------------------
- The cleaned_incident_narrative MUST preserve the original meaning and key phrases from the raw description.
- DO NOT invent details not present in the raw description (e.g., "failed to swerve because of traffic", "visibility was poor").
- DO NOT add causal explanations that are not stated in the original text.
- If the description is short or lacks detail, keep the cleaned narrative short — do NOT pad it with assumptions.
- The sequence_of_events MUST only describe what is explicitly stated or directly implied by the raw text.
- Every factual claim in your output must be traceable to a specific phrase in the raw description.
- If information is not available, use null or "not stated" — never fabricate.

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

STAKEHOLDER ACCOUNTS AND POLICE CONTEXT
----------------------------------------
${scenarioContext}
${policeChargeContext}
${policeOfficerContext}
${thirdPartyAccountContext}

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

5. ANALYSE STAKEHOLDER VOICES — reason like a senior loss adjuster:
   - Summarise what the claimant says happened
   - Summarise what the third party says (if available)
   - Summarise what the police officer found (if available)
   - Identify where accounts AGREE (corroboration strengthens credibility)
   - Identify where accounts CONTRADICT (contradictions require investigation)
   - Determine the LIABILITY POSTURE: who appears to be at fault based on all evidence?
     * If the claimant was charged → CLAIMANT_AT_FAULT
     * If the third party was charged → THIRD_PARTY_AT_FAULT
     * If the matter is under investigation → UNDER_INVESTIGATION
     * If accounts are contradictory with no charge → UNDETERMINED
     * If both parties contributed → SHARED_FAULT
   - Write a professional ADJUSTER OPINION (2-4 sentences) that a senior adjuster would be comfortable signing
   - IMPORTANT: If only the claimant's account is available, say so explicitly and note that the liability posture is provisional

6. PRODUCE a reasoning summary for the adjuster (2-4 sentences, professional tone, factual).

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
  "confidence": number (0-100),
  "stakeholder_analysis": {
    "claimant_account": "string — what the claimant says happened",
    "third_party_account": "string or null — third party's version if available",
    "police_findings": "string or null — officer's factual findings if available",
    "claimant_charged": true/false,
    "third_party_charged": true/false,
    "under_investigation": true/false,
    "agreement_points": ["string"],
    "contradiction_points": ["string"],
    "liability_posture": "CLAIMANT_AT_FAULT" | "THIRD_PARTY_AT_FAULT" | "SHARED_FAULT" | "UNDETERMINED" | "UNDER_INVESTIGATION",
    "adjuster_opinion": "string — 2-4 sentence professional adjuster opinion",
    "liability_confidence": number (0-100)
  }
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
              stakeholder_analysis: {
                type: "object",
                properties: {
                  claimant_account: { type: "string" },
                  third_party_account: { type: ["string", "null"] },
                  police_findings: { type: ["string", "null"] },
                  claimant_charged: { type: "boolean" },
                  third_party_charged: { type: "boolean" },
                  under_investigation: { type: "boolean" },
                  agreement_points: { type: "array", items: { type: "string" } },
                  contradiction_points: { type: "array", items: { type: "string" } },
                  liability_posture: { type: "string" },
                  adjuster_opinion: { type: "string" },
                  liability_confidence: { type: "number" },
                },
                required: [
                  "claimant_account", "third_party_account", "police_findings",
                  "claimant_charged", "third_party_charged", "under_investigation",
                  "agreement_points", "contradiction_points",
                  "liability_posture", "adjuster_opinion", "liability_confidence",
                ],
                additionalProperties: false,
              },
              confidence: { type: "number" },
            },
            required: [
              "cleaned_incident_narrative", "segments", "extracted_facts",
              "cross_validation", "fraud_signals", "consistency_verdict",
              "reasoning_summary", "confidence", "stakeholder_analysis",
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
    stakeholder_analysis: parsed.stakeholder_analysis ?? undefined,
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

  // ── TOKEN FIDELITY SAFEGUARD ──────────────────────────────────────────────
  // If the LLM output contains fabricated content (key phrases from original
  // are missing), fall back to the pre-cleaned narrative.
  const originalTokens = new Set(
    preCleanedNarrative.toLowerCase().split(/\s+/).filter(t => t.length > 3)
  );
  const outputTokens = new Set(
    (llmResult.cleaned_incident_narrative ?? "").toLowerCase().split(/\s+/).filter(t => t.length > 3)
  );
  let matchCount = 0;
  for (const t of originalTokens) {
    if (outputTokens.has(t)) matchCount++;
  }
  const fidelityRatio = originalTokens.size > 0 ? matchCount / originalTokens.size : 1;
  const FIDELITY_THRESHOLD = 0.40; // At least 40% of original tokens must be preserved
  const useFallback = fidelityRatio < FIDELITY_THRESHOLD && preCleanedNarrative.length > 20;
  if (useFallback) {
    console.warn(`[NarrativeEngine] Token fidelity too low (${(fidelityRatio * 100).toFixed(1)}%). Falling back to pre-cleaned narrative.`);
  }

  return {
    raw_description: raw,
    cleaned_incident_narrative: useFallback ? preCleanedNarrative : llmResult.cleaned_incident_narrative,
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
