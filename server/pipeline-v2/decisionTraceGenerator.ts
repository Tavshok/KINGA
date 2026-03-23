/**
 * decisionTraceGenerator.ts
 *
 * Decision Trace Generator — Phase 4 of the KINGA AutoVerify AI pipeline.
 *
 * Creates a structured, human-readable audit trail showing HOW a claim
 * decision was reached, stage by stage. Each entry records:
 *   - which pipeline stage ran
 *   - what it received as input (concise summary)
 *   - what it produced as output (concise summary)
 *   - how that output influenced the final recommendation
 *
 * Return shape (matches the prompt contract):
 * {
 *   "decision_trace": [
 *     {
 *       "stage": "",
 *       "input_summary": "",
 *       "output_summary": "",
 *       "impact_on_decision": ""
 *     }
 *   ]
 * }
 *
 * Rules:
 * - Include key stages only (extraction, physics, damage, fraud, cost)
 * - Keep summaries concise (≤ 120 chars each)
 * - Must clearly justify the final recommendation
 */

import type { FraudRiskLevel } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TraceStageEntry {
  stage: string;
  input_summary: string;
  output_summary: string;
  impact_on_decision: string;
}

export interface DecisionTraceOutput {
  decision_trace: TraceStageEntry[];
  final_recommendation: "APPROVE" | "REVIEW" | "REJECT";
  final_confidence: number;
  executive_summary: string;
  trace_complete: boolean;
  missing_stages: string[];
  metadata: {
    engine: "DecisionTraceGenerator";
    version: "1.0.0";
    stages_included: number;
    stages_skipped: number;
    timestamp_utc: string;
  };
}

export interface ExtractionStageInput {
  total_documents?: number | null;
  total_pages?: number | null;
  ocr_applied?: boolean | null;
  ocr_confidence?: number | null;
  primary_document_type?: string | null;
}

export interface DataExtractionStageInput {
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | null;
  incident_type?: string | null;
  claim_amount_cents?: number | null;
  damaged_components_count?: number | null;
  fields_extracted?: number | null;
  fields_missing?: number | null;
}

export interface DamageStageInput {
  damaged_components?: string[] | null;
  severity?: string | null;
  is_consistent?: boolean | null;
  consistency_score?: number | null;
  has_unexplained_damage?: boolean | null;
  structural_damage?: boolean | null;
  summary?: string | null;
}

export interface PhysicsStageInput {
  is_plausible?: boolean | null;
  confidence?: number | null;
  has_critical_inconsistency?: boolean | null;
  impact_direction?: string | null;
  energy_level?: string | null;
  summary?: string | null;
}

export interface FraudStageInput {
  fraud_risk_level?: FraudRiskLevel | null;
  fraud_risk_score?: number | null;
  critical_flag_count?: number | null;
  top_indicators?: string[] | null;
  scenario_fraud_flagged?: boolean | null;
  reasoning?: string | null;
}

export interface CostStageInput {
  expected_cost_cents?: number | null;
  claim_amount_cents?: number | null;
  quote_deviation_pct?: number | null;
  recommendation?: "NEGOTIATE" | "PROCEED_TO_ASSESSMENT" | "ESCALATE" | null;
  is_within_range?: boolean | null;
  has_anomalies?: boolean | null;
  savings_opportunity_cents?: number | null;
  reasoning?: string | null;
}

export interface ConsistencyStageInput {
  overall_status?: "CONSISTENT" | "CONFLICTED" | null;
  consistency_score?: number | null;
  critical_conflict_count?: number | null;
  proceed?: boolean | null;
  summary?: string | null;
}

export interface DecisionTraceInput {
  final_recommendation: "APPROVE" | "REVIEW" | "REJECT";
  final_confidence: number;
  decision_basis?: "assessor_validated" | "system_validated" | "insufficient_data" | null;
  key_drivers?: string[] | null;
  blocking_factors?: string[] | null;
  extraction?: ExtractionStageInput | null;
  data_extraction?: DataExtractionStageInput | null;
  damage?: DamageStageInput | null;
  physics?: PhysicsStageInput | null;
  fraud?: FraudStageInput | null;
  cost?: CostStageInput | null;
  consistency?: ConsistencyStageInput | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  if (abs >= 100_000_00) return `$${(abs / 100_000_00).toFixed(1)}M`;
  if (abs >= 100_000) return `$${(abs / 100_000).toFixed(1)}k`;
  return `$${(abs / 100).toFixed(0)}`;
}

function fraudLevelLabel(level: FraudRiskLevel | null | undefined): string {
  const map: Record<FraudRiskLevel, string> = {
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    elevated: "Elevated",
    high: "High",
  };
  return level ? (map[level] ?? level) : "Unknown";
}

function impactLabel(
  recommendation: "APPROVE" | "REVIEW" | "REJECT",
  stage: string,
  stageData: Record<string, unknown>
): string {
  if (stage === "extraction") {
    const ocrConf = stageData.ocr_confidence as number | null;
    if (ocrConf != null && ocrConf < 60) {
      return recommendation === "REVIEW" || recommendation === "REJECT"
        ? "Low OCR confidence contributed to data quality warnings and REVIEW routing."
        : "Low OCR confidence noted but did not block decision.";
    }
    return "Document ingestion succeeded; no impact on recommendation.";
  }

  if (stage === "extraction_data") {
    const missing = stageData.fields_missing as number | null;
    if (missing != null && missing > 5) {
      return recommendation === "REVIEW"
        ? "High number of missing fields triggered insufficient-data REVIEW path."
        : recommendation === "REJECT"
        ? "Critical missing fields contributed to REJECT."
        : "Missing fields noted; sufficient data remained for APPROVE.";
    }
    return "Structured extraction complete; data quality sufficient for downstream stages.";
  }

  if (stage === "physics") {
    const plausible = stageData.is_plausible as boolean | null;
    const critical = stageData.has_critical_inconsistency as boolean | null;
    if (critical) return "Critical physical inconsistency → deterministic REJECT trigger.";
    if (plausible === false) {
      return recommendation === "REJECT"
        ? "Physics implausibility confirmed REJECT recommendation."
        : "Physics implausibility raised concern but was overridden by other signals.";
    }
    if (plausible === true) {
      return recommendation === "APPROVE"
        ? "Physics plausibility confirmed — supported APPROVE."
        : "Physics plausible but other signals prevented APPROVE.";
    }
    return "Physics result unavailable; confidence reduced.";
  }

  if (stage === "damage") {
    const consistent = stageData.is_consistent as boolean | null;
    const unexplained = stageData.has_unexplained_damage as boolean | null;
    if (consistent === false) {
      return recommendation === "REJECT"
        ? "Damage inconsistency confirmed REJECT."
        : "Damage inconsistency triggered REVIEW.";
    }
    if (unexplained) return "Unexplained damage patterns added to REVIEW signals.";
    if (consistent === true) {
      return recommendation === "APPROVE"
        ? "Damage consistent with incident — supported APPROVE."
        : "Damage consistent but other signals prevented APPROVE.";
    }
    return "Damage validation unavailable; consistency assumed neutral.";
  }

  if (stage === "fraud") {
    const level = stageData.fraud_risk_level as FraudRiskLevel | null;
    if (level === "high" || level === "elevated") {
      return "High/Elevated fraud risk → deterministic REJECT trigger.";
    }
    if (level === "medium") {
      return recommendation === "REVIEW"
        ? "Medium fraud risk confirmed REVIEW routing."
        : recommendation === "REJECT"
        ? "Medium fraud risk contributed to REJECT alongside other signals."
        : "Medium fraud risk noted but insufficient alone to block APPROVE.";
    }
    if (level === "low" || level === "minimal") {
      return recommendation === "APPROVE"
        ? "Low fraud risk supported APPROVE."
        : "Low fraud risk noted; REVIEW/REJECT driven by other signals.";
    }
    return "Fraud risk level unavailable; treated as medium for safety.";
  }

  if (stage === "cost") {
    const rec = stageData.recommendation as string | null;
    const withinRange = stageData.is_within_range as boolean | null;
    if (rec === "ESCALATE") {
      return recommendation === "REJECT"
        ? "Cost escalation flag confirmed REJECT."
        : "Cost escalation triggered REVIEW.";
    }
    if (rec === "NEGOTIATE") return "Cost negotiation flag added to REVIEW signals.";
    if (withinRange === true) {
      return recommendation === "APPROVE"
        ? "Cost within acceptable range — supported APPROVE."
        : "Cost within range but other signals prevented APPROVE.";
    }
    return "Cost analysis unavailable; cost signal treated as neutral.";
  }

  if (stage === "consistency") {
    const status = stageData.overall_status as string | null;
    const criticalConflicts = stageData.critical_conflict_count as number | null;
    if (criticalConflicts != null && criticalConflicts > 0) {
      return "Critical cross-engine conflicts → deterministic REJECT trigger.";
    }
    if (status === "CONFLICTED") {
      return recommendation === "REVIEW"
        ? "Cross-engine conflicts confirmed REVIEW routing."
        : recommendation === "REJECT"
        ? "Cross-engine conflicts contributed to REJECT."
        : "Conflicts present but resolved; APPROVE maintained.";
    }
    if (status === "CONSISTENT") {
      return recommendation === "APPROVE"
        ? "All engines consistent — confirmed APPROVE."
        : "Engines consistent but other signals prevented APPROVE.";
    }
    return "Consistency check unavailable; treated as neutral.";
  }

  return "No impact assessed.";
}

// ─── Stage Builders ───────────────────────────────────────────────────────────

function buildExtractionEntry(
  data: ExtractionStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const docs = data.total_documents ?? 0;
  const pages = data.total_pages ?? 0;
  const docType = data.primary_document_type ?? "unknown";
  const ocrConf = data.ocr_confidence;
  const ocrApplied = data.ocr_applied;

  const inputSummary = truncate(
    `${docs} document(s), ${pages} page(s) ingested. Primary type: ${docType}.`
  );

  const outputParts: string[] = [];
  if (ocrApplied) {
    outputParts.push(`OCR applied (confidence: ${ocrConf != null ? `${ocrConf}%` : "unknown"})`);
  } else {
    outputParts.push("Native text extraction (no OCR required)");
  }
  if (ocrConf != null && ocrConf < 60) outputParts.push("⚠ Low OCR confidence");
  const outputSummary = truncate(outputParts.join(". ") + ".");

  return {
    stage: "Stage 1–2 — Document Ingestion & OCR",
    input_summary: inputSummary,
    output_summary: outputSummary,
    impact_on_decision: impactLabel(recommendation, "extraction", data as Record<string, unknown>),
  };
}

function buildDataExtractionEntry(
  data: DataExtractionStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const vehicle = [data.vehicle_year, data.vehicle_make, data.vehicle_model]
    .filter(Boolean)
    .join(" ") || "Unknown vehicle";
  const incidentType = data.incident_type ?? "unknown incident type";
  const claimAmt = data.claim_amount_cents != null ? formatCents(data.claim_amount_cents) : "unknown amount";
  const components = data.damaged_components_count ?? 0;
  const extracted = data.fields_extracted ?? 0;
  const missing = data.fields_missing ?? 0;

  const inputSummary = truncate(
    `${vehicle}, ${incidentType}, claim ${claimAmt}. ${components} damaged component(s) identified.`
  );
  const outputSummary = truncate(
    `${extracted} fields extracted, ${missing} missing. ${missing > 5 ? "⚠ High missing field count." : "Data completeness acceptable."}`
  );

  return {
    stage: "Stage 3 — Structured Data Extraction",
    input_summary: inputSummary,
    output_summary: outputSummary,
    impact_on_decision: impactLabel(recommendation, "extraction_data", {
      fields_missing: missing,
    } as Record<string, unknown>),
  };
}

function buildPhysicsEntry(
  data: PhysicsStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const direction = data.impact_direction ?? "unknown direction";
  const energy = data.energy_level ?? "unknown energy";

  const inputSummary = truncate(`Impact direction: ${direction}. Energy level: ${energy}.`);

  const outputParts: string[] = [];
  if (data.is_plausible === true) outputParts.push("Physically plausible");
  else if (data.is_plausible === false) outputParts.push("⚠ Physically implausible");
  else outputParts.push("Plausibility unknown");
  if (data.has_critical_inconsistency) outputParts.push("🚫 Critical inconsistency detected");
  if (data.confidence != null) outputParts.push(`Confidence: ${data.confidence}%`);
  if (data.summary) outputParts.push(data.summary.slice(0, 60));

  return {
    stage: "Stage 7 — Physics Analysis",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactLabel(recommendation, "physics", data as Record<string, unknown>),
  };
}

function buildDamageEntry(
  data: DamageStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const components = data.damaged_components?.slice(0, 4).join(", ") ?? "none listed";
  const severity = data.severity ?? "unknown severity";

  const inputSummary = truncate(`Severity: ${severity}. Components: ${components}.`);

  const outputParts: string[] = [];
  if (data.is_consistent === true) outputParts.push("Damage consistent with incident");
  else if (data.is_consistent === false) outputParts.push("⚠ Damage inconsistent with incident");
  else outputParts.push("Consistency unknown");
  if (data.consistency_score != null) outputParts.push(`Score: ${data.consistency_score}%`);
  if (data.has_unexplained_damage) outputParts.push("⚠ Unexplained damage present");
  if (data.structural_damage) outputParts.push("Structural damage confirmed");
  if (data.summary) outputParts.push(data.summary.slice(0, 60));

  return {
    stage: "Stage 6 — Damage Analysis",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactLabel(recommendation, "damage", data as Record<string, unknown>),
  };
}

function buildFraudEntry(
  data: FraudStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const topIndicators = data.top_indicators?.slice(0, 3).join(", ") ?? "none";

  const inputSummary = truncate(
    `Fraud score: ${data.fraud_risk_score ?? "N/A"}. Top indicators: ${topIndicators}.`
  );

  const outputParts: string[] = [];
  outputParts.push(`Risk level: ${fraudLevelLabel(data.fraud_risk_level ?? null)}`);
  if (data.critical_flag_count != null && data.critical_flag_count > 0) {
    outputParts.push(`🚫 ${data.critical_flag_count} critical flag(s)`);
  }
  if (data.scenario_fraud_flagged) outputParts.push("Scenario fraud engine flagged");
  if (data.reasoning) outputParts.push(data.reasoning.slice(0, 60));

  return {
    stage: "Stage 8 — Fraud Analysis",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactLabel(recommendation, "fraud", data as Record<string, unknown>),
  };
}

function buildCostEntry(
  data: CostStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const expected = data.expected_cost_cents != null ? formatCents(data.expected_cost_cents) : "N/A";
  const claimed = data.claim_amount_cents != null ? formatCents(data.claim_amount_cents) : "N/A";
  const deviation = data.quote_deviation_pct != null ? `${data.quote_deviation_pct.toFixed(1)}%` : "N/A";

  const inputSummary = truncate(
    `Expected: ${expected}. Claimed: ${claimed}. Quote deviation: ${deviation}.`
  );

  const recLabel: Record<string, string> = {
    PROCEED_TO_ASSESSMENT: "Proceed to assessment",
    NEGOTIATE: "Negotiate",
    ESCALATE: "Escalate",
  };

  const outputParts: string[] = [];
  outputParts.push(`Recommendation: ${recLabel[data.recommendation ?? ""] ?? "N/A"}`);
  if (data.is_within_range === true) outputParts.push("Cost within acceptable range");
  else if (data.is_within_range === false) outputParts.push("⚠ Cost outside acceptable range");
  if (data.has_anomalies) outputParts.push("⚠ Cost anomalies detected");
  if (data.savings_opportunity_cents != null && data.savings_opportunity_cents > 0) {
    outputParts.push(`Savings opportunity: ${formatCents(data.savings_opportunity_cents)}`);
  }
  if (data.reasoning) outputParts.push(data.reasoning.slice(0, 60));

  return {
    stage: "Stage 9 — Cost Optimisation",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactLabel(recommendation, "cost", data as Record<string, unknown>),
  };
}

function buildConsistencyEntry(
  data: ConsistencyStageInput,
  recommendation: "APPROVE" | "REVIEW" | "REJECT"
): TraceStageEntry {
  const inputSummary = truncate(
    "Cross-engine consistency check across physics, damage, and fraud signals."
  );

  const outputParts: string[] = [];
  if (data.overall_status) outputParts.push(`Status: ${data.overall_status}`);
  if (data.consistency_score != null) outputParts.push(`Score: ${data.consistency_score}%`);
  if (data.critical_conflict_count != null && data.critical_conflict_count > 0) {
    outputParts.push(`🚫 ${data.critical_conflict_count} critical conflict(s)`);
  }
  if (data.proceed === false) outputParts.push("Proceed blocked by conflicts");
  if (data.summary) outputParts.push(data.summary.slice(0, 60));

  return {
    stage: "Stage 8b — Cross-Engine Consistency",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactLabel(recommendation, "consistency", data as Record<string, unknown>),
  };
}

function buildDecisionEntry(
  recommendation: "APPROVE" | "REVIEW" | "REJECT",
  confidence: number,
  decisionBasis: string | null | undefined,
  keyDrivers: string[] | null | undefined,
  blockingFactors: string[] | null | undefined
): TraceStageEntry {
  const drivers = keyDrivers?.slice(0, 3).join("; ") ?? "none";
  const blockers = blockingFactors?.slice(0, 2).join("; ") ?? "none";
  const basis = decisionBasis ?? "system_validated";

  const inputSummary = truncate(
    `All upstream signals synthesised. Key drivers: ${drivers}.`
  );

  const outputParts: string[] = [
    `Recommendation: ${recommendation}`,
    `Confidence: ${confidence}%`,
    `Basis: ${basis}`,
  ];
  if (blockingFactors && blockingFactors.length > 0) {
    outputParts.push(`Blockers: ${blockers}`);
  }

  const impactMap: Record<string, string> = {
    APPROVE: "All signals clear — APPROVE issued with full confidence.",
    REVIEW: "One or more signals require human review — REVIEW issued.",
    REJECT: "One or more deterministic REJECT triggers fired — REJECT issued.",
  };

  return {
    stage: "Phase 4 — Claims Decision Authority",
    input_summary: inputSummary,
    output_summary: truncate(outputParts.join(". ") + "."),
    impact_on_decision: impactMap[recommendation] ?? "Decision issued.",
  };
}

// ─── Executive Summary ────────────────────────────────────────────────────────

function buildExecutiveSummary(
  input: DecisionTraceInput,
  trace: TraceStageEntry[]
): string {
  const { final_recommendation: rec, final_confidence: conf } = input;
  const stageCount = trace.length;

  if (rec === "APPROVE") {
    return truncate(
      `Claim passed all ${stageCount} pipeline stages with ${conf}% confidence — physics plausible, damage consistent, fraud low, cost within range.`,
      200
    );
  }

  if (rec === "REJECT") {
    const rejectEntry = trace.find((e) =>
      e.impact_on_decision.toLowerCase().includes("deterministic reject")
    );
    const trigger = rejectEntry ? rejectEntry.stage : "one or more stages";
    return truncate(
      `Claim rejected at ${trigger} — a deterministic REJECT trigger was fired (confidence: ${conf}%).`,
      200
    );
  }

  // REVIEW
  const reviewEntries = trace.filter((e) =>
    e.impact_on_decision.toLowerCase().includes("review")
  );
  const reviewStages = reviewEntries.map((e) => e.stage.split("—")[0].trim()).join(", ");
  return truncate(
    `Claim routed to manual REVIEW (confidence: ${conf}%) — signals from ${reviewStages || "multiple stages"} require human assessment.`,
    200
  );
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export function generateDecisionTrace(input: DecisionTraceInput): DecisionTraceOutput {
  const rec = input.final_recommendation;
  const conf = input.final_confidence;
  const trace: TraceStageEntry[] = [];
  const missingStages: string[] = [];

  if (input.extraction) {
    trace.push(buildExtractionEntry(input.extraction, rec));
  } else {
    missingStages.push("Stage 1–2 (Document Ingestion & OCR)");
  }

  if (input.data_extraction) {
    trace.push(buildDataExtractionEntry(input.data_extraction, rec));
  } else {
    missingStages.push("Stage 3 (Data Extraction)");
  }

  if (input.damage) {
    trace.push(buildDamageEntry(input.damage, rec));
  } else {
    missingStages.push("Stage 6 (Damage Analysis)");
  }

  if (input.physics) {
    trace.push(buildPhysicsEntry(input.physics, rec));
  } else {
    missingStages.push("Stage 7 (Physics Analysis)");
  }

  if (input.fraud) {
    trace.push(buildFraudEntry(input.fraud, rec));
  } else {
    missingStages.push("Stage 8 (Fraud Analysis)");
  }

  if (input.consistency) {
    trace.push(buildConsistencyEntry(input.consistency, rec));
  }

  if (input.cost) {
    trace.push(buildCostEntry(input.cost, rec));
  } else {
    missingStages.push("Stage 9 (Cost Optimisation)");
  }

  trace.push(
    buildDecisionEntry(rec, conf, input.decision_basis, input.key_drivers, input.blocking_factors)
  );

  const executiveSummary = buildExecutiveSummary(input, trace);

  return {
    decision_trace: trace,
    final_recommendation: rec,
    final_confidence: conf,
    executive_summary: executiveSummary,
    trace_complete: missingStages.length === 0,
    missing_stages: missingStages,
    metadata: {
      engine: "DecisionTraceGenerator",
      version: "1.0.0",
      stages_included: trace.length,
      stages_skipped: missingStages.length,
      timestamp_utc: new Date().toISOString(),
    },
  };
}

/**
 * Build a DecisionTraceInput from raw aiAssessment and claim DB rows.
 */
export function buildDecisionTraceInputFromDb(
  aiAssessment: Record<string, unknown>,
  claim: Record<string, unknown>,
  decisionResult: {
    recommendation: "APPROVE" | "REVIEW" | "REJECT";
    confidence: number;
    decision_basis?: string;
    key_drivers?: string[];
    blocking_factors?: string[];
  }
): DecisionTraceInput {
  const parseJson = (field: unknown): Record<string, unknown> | null => {
    if (!field) return null;
    if (typeof field === "object") return field as Record<string, unknown>;
    try { return JSON.parse(field as string); } catch { return null; }
  };

  const consistencyJson = parseJson(aiAssessment.consistencyCheckJson);
  const costRealismJson = parseJson(aiAssessment.costRealismJson);

  const damagedComponents = (() => {
    const raw = parseJson(aiAssessment.damagedComponentsJson);
    if (!raw) return null;
    if (Array.isArray(raw)) {
      return raw.map((c: unknown) =>
        typeof c === "string" ? c : (c as Record<string, string>)?.name ?? String(c)
      );
    }
    return null;
  })();

  const fraudIndicators = (() => {
    const raw = parseJson(aiAssessment.fraudScoreBreakdownJson);
    if (!raw || !Array.isArray(raw)) return null;
    return (raw as Array<{ indicator?: string; description?: string }>)
      .slice(0, 5)
      .map((i) => i.indicator ?? i.description ?? "unknown");
  })();

  const estCost = Number(aiAssessment.estimatedCost ?? 0);
  const approvedAmt = Number(claim.finalApprovedAmount ?? 0);
  const costDeviation = approvedAmt > 0 ? Math.abs(estCost - approvedAmt) / approvedAmt : null;

  return {
    final_recommendation: decisionResult.recommendation,
    final_confidence: decisionResult.confidence,
    decision_basis: decisionResult.decision_basis as DecisionTraceInput["decision_basis"],
    key_drivers: decisionResult.key_drivers ?? null,
    blocking_factors: decisionResult.blocking_factors ?? null,

    extraction: {
      total_documents: 1,
      total_pages: null,
      ocr_applied: null,
      ocr_confidence: null,
      primary_document_type: "claim_document",
    },

    data_extraction: {
      vehicle_make: aiAssessment.vehicleMake as string ?? null,
      vehicle_model: aiAssessment.vehicleModel as string ?? null,
      vehicle_year: aiAssessment.vehicleYear as number ?? null,
      incident_type: (claim.incidentType ?? aiAssessment.incidentType) as string ?? null,
      claim_amount_cents: claim.claimAmount != null
        ? Math.round(Number(claim.claimAmount) * 100) : null,
      damaged_components_count: damagedComponents?.length ?? null,
      fields_extracted: null,
      fields_missing: null,
    },

    damage: {
      damaged_components: damagedComponents,
      severity: aiAssessment.structuralDamageSeverity as string ?? null,
      is_consistent: consistencyJson?.overall_status === "CONSISTENT",
      consistency_score: consistencyJson?.consistency_score as number ?? null,
      has_unexplained_damage: consistencyJson?.has_unexplained_damage as boolean ?? null,
      structural_damage: aiAssessment.structuralDamageSeverity
        ? (aiAssessment.structuralDamageSeverity as string) !== "none" : null,
      summary: consistencyJson?.summary as string ?? null,
    },

    physics: {
      is_plausible: aiAssessment.physicsAnalysis
        ? !(aiAssessment.physicsAnalysis as string).toLowerCase().includes("implausible") : null,
      confidence: aiAssessment.confidenceScore as number ?? null,
      has_critical_inconsistency: aiAssessment.physicsAnalysis
        ? (aiAssessment.physicsAnalysis as string).toLowerCase().includes("critical") : null,
      impact_direction: aiAssessment.impactDirection as string ?? null,
      energy_level: null,
      summary: aiAssessment.physicsAnalysis
        ? (aiAssessment.physicsAnalysis as string).slice(0, 100) : null,
    },

    fraud: {
      fraud_risk_level: aiAssessment.fraudRiskLevel as FraudRiskLevel ?? null,
      fraud_risk_score: aiAssessment.fraudRiskScore as number ?? null,
      critical_flag_count: null,
      top_indicators: fraudIndicators,
      scenario_fraud_flagged: null,
      reasoning: null,
    },

    cost: {
      expected_cost_cents: estCost > 0 ? Math.round(estCost * 100) : null,
      claim_amount_cents: claim.claimAmount != null
        ? Math.round(Number(claim.claimAmount) * 100) : null,
      quote_deviation_pct: costRealismJson?.deviation_pct as number ?? null,
      recommendation: costDeviation == null
        ? "ESCALATE"
        : costDeviation > 0.4 ? "ESCALATE"
        : costDeviation > 0.15 ? "NEGOTIATE"
        : "PROCEED_TO_ASSESSMENT",
      is_within_range: costDeviation != null ? costDeviation <= 0.4 : null,
      has_anomalies: costRealismJson?.has_anomalies as boolean ?? false,
      savings_opportunity_cents: null,
      reasoning: null,
    },

    consistency: consistencyJson
      ? {
          overall_status: consistencyJson.overall_status as "CONSISTENT" | "CONFLICTED" ?? null,
          consistency_score: consistencyJson.consistency_score as number ?? null,
          critical_conflict_count: consistencyJson.critical_conflict_count as number ?? 0,
          proceed: consistencyJson.proceed as boolean ?? true,
          summary: consistencyJson.summary as string ?? null,
        }
      : null,
  };
}
