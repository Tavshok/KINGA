/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TRUTH RULE ENGINE — TRE v3.0 Enhancement 1
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Moves reconciliation decisions from hard-coded logic into configurable,
 * declarative truth rules. Rules are evaluated against a TruthRuleContext
 * derived from all engine outputs, and the results are fed into the TRE.
 *
 * Architecture position:
 *   All Analytical Engines → Truth Governance Registry → Truth Rule Engine → TRE
 *
 * Design principles:
 *   - Rules are data, not code
 *   - Rules are ordered by priority (lower number = higher priority)
 *   - Rules are evaluated in priority order; first matching rule wins per field
 *   - Rules are auditable — every decision records which rule fired
 *   - Rules are backward-compatible — if no rule fires, TRE v2.0 logic applies
 */

// ─────────────────────────────────────────────────────────────────────────────
// RULE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type RuleConditionOperator =
  | "gt"   // greater than
  | "gte"  // greater than or equal
  | "lt"   // less than
  | "lte"  // less than or equal
  | "eq"   // equal
  | "neq"  // not equal
  | "exists"   // field is not null/undefined
  | "missing"  // field is null/undefined
  | "in"       // value is in array
  | "not_in";  // value is not in array

export interface RuleCondition {
  /** Dot-notation path into TruthRuleContext, e.g. "physics.confidence" */
  field: string;
  operator: RuleConditionOperator;
  /** Expected value for comparison operators; array for "in"/"not_in" */
  value?: unknown;
}

export type RuleResolutionAction =
  | "use_canonical_owner"
  | "use_highest_confidence"
  | "use_physics_engine"
  | "use_conservative_value"
  | "escalate_to_analyst"
  | "suppress_advisory"
  | "block_publication"
  | "require_approval";

export type RuleConflictSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface TruthRule {
  /** Unique rule identifier, e.g. "physics-speed-priority" */
  ruleId: string;
  /** Human-readable description */
  description: string;
  /** The CTO field path this rule governs, e.g. "physics.estimatedSpeedKmh" */
  field: string;
  /** ALL conditions must be true for the rule to fire */
  conditions: RuleCondition[];
  /** Priority — lower number fires first; rules with same priority are evaluated in order */
  priority: number;
  /** Canonical owner when this rule fires */
  canonicalOwner: string;
  /** Resolution action */
  resolution: RuleResolutionAction;
  /** Conflict severity to record if this rule fires due to a conflict */
  conflictSeverity: RuleConflictSeverity;
  /** Confidence impact: positive = boost, negative = penalty */
  confidenceImpact: number;
  /** Whether an audit record must be created when this rule fires */
  auditRequired: boolean;
  /** Whether this rule blocks publication when it fires */
  blocksPublication: boolean;
  /** Plain-language explanation of why this rule exists */
  rationale: string;
  /** Which regulatory profiles this rule applies to (empty = all) */
  applicableProfiles: string[];
  /** Whether this rule is currently active */
  enabled: boolean;
}

export interface TruthRuleResult {
  ruleId: string;
  field: string;
  fired: boolean;
  canonicalOwner: string;
  resolution: RuleResolutionAction;
  conflictSeverity: RuleConflictSeverity;
  confidenceImpact: number;
  blocksPublication: boolean;
  auditRequired: boolean;
  explanation: string;
  conditionResults: Array<{ condition: RuleCondition; passed: boolean; actualValue: unknown }>;
}

export interface TruthRuleEngineResult {
  /** All rules that fired, in priority order */
  firedRules: TruthRuleResult[];
  /** Rules that were evaluated but did not fire */
  skippedRules: TruthRuleResult[];
  /** Net confidence impact from all fired rules */
  totalConfidenceImpact: number;
  /** Whether any fired rule blocks publication */
  blocksPublication: boolean;
  /** Field-level decisions: field path → winning rule result */
  fieldDecisions: Record<string, TruthRuleResult>;
  /** Audit records for rules that require audit */
  auditRecords: Array<{ ruleId: string; field: string; timestamp: string; explanation: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUTH RULE CONTEXT — flattened view of all engine outputs for condition eval
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthRuleContext {
  physics: {
    confidence: number | null;
    speedKmh: number | null;
    status: string;
    damageConsistencyScore: number;
    supportingEvidenceAvailable: boolean;
    visionSourceReliability: "HIGH" | "MEDIUM" | "LOW" | "NONE";
  };
  fraud: {
    score: number;
    level: string;
    indicatorCount: number;
    highSeverityIndicatorCount: number;
  };
  cost: {
    optimisedCostUsd: number;
    confidence: number | null;
    recommendation: string;
    quoteDeviationPct: number | null;
  };
  damage: {
    severity: string;
    structuralDamageDetected: boolean;
    componentCount: number;
    hasConfirmedDamagePhotos: boolean;
  };
  evidence: {
    photoCount: number;
    documentCount: number;
    completenessScore: number;
    hasQuotation: boolean;
  };
  claim: {
    ageDays: number | null;
    lateSubmission: boolean;
    incidentType: string | null;
    policyNumber: string | null;
  };
  consistency: {
    blockAutoApproval: boolean;
    criticalConflictCount: number;
    highConflictCount: number;
  };
  ctl: {
    decision: string | null;
    fraudScore: number | null;
  };
  stage9: {
    decision: string | null;
    costUsd: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN TRUTH RULES (v3.0 canonical ruleset)
// ─────────────────────────────────────────────────────────────────────────────

export const BUILT_IN_TRUTH_RULES: TruthRule[] = [
  // ── PHYSICS SPEED RULES ───────────────────────────────────────────────────
  {
    ruleId: "physics-speed-priority",
    description: "Physics engine speed estimate takes priority when confidence > 70 and supporting evidence is available",
    field: "physics.estimatedSpeedKmh",
    conditions: [
      { field: "physics.confidence", operator: "gt", value: 70 },
      { field: "physics.supportingEvidenceAvailable", operator: "eq", value: true },
    ],
    priority: 10,
    canonicalOwner: "stage7_physics",
    resolution: "use_physics_engine",
    conflictSeverity: "MEDIUM",
    confidenceImpact: 5,
    auditRequired: false,
    blocksPublication: false,
    rationale: "Physics engine fuses damage, speed, and structural signals — more reliable than driver narrative when evidence is available",
    applicableProfiles: [],
    enabled: true,
  },
  {
    ruleId: "physics-speed-low-confidence-fallback",
    description: "Flag speed estimate as LOW confidence when physics confidence is below 50",
    field: "physics.estimatedSpeedKmh",
    conditions: [
      { field: "physics.confidence", operator: "lt", value: 50 },
    ],
    priority: 20,
    canonicalOwner: "stage7_physics",
    resolution: "suppress_advisory",
    conflictSeverity: "LOW",
    confidenceImpact: -10,
    auditRequired: false,
    blocksPublication: false,
    rationale: "Low physics confidence means speed estimate is unreliable — reduce overall confidence and flag for review",
    applicableProfiles: [],
    enabled: true,
  },

  // ── FRAUD RULES ───────────────────────────────────────────────────────────
  {
    ruleId: "fraud-high-risk-escalation",
    description: "Escalate to analyst when fraud score >= 80",
    field: "decision.recommendation",
    conditions: [
      { field: "fraud.score", operator: "gte", value: 80 },
    ],
    priority: 5,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "escalate_to_analyst",
    conflictSeverity: "HIGH",
    confidenceImpact: -15,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Fraud scores >= 80 require mandatory analyst review before any payment authorisation",
    applicableProfiles: [],
    enabled: true,
  },
  {
    ruleId: "fraud-critical-block",
    description: "Block publication when fraud score >= 95 (near-certain fraud)",
    field: "decision.recommendation",
    conditions: [
      { field: "fraud.score", operator: "gte", value: 95 },
    ],
    priority: 1,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "block_publication",
    conflictSeverity: "CRITICAL",
    confidenceImpact: -30,
    auditRequired: true,
    blocksPublication: true,
    rationale: "Fraud scores >= 95 indicate near-certain fraud — block publication and require SIU referral",
    applicableProfiles: [],
    enabled: true,
  },
  {
    ruleId: "fraud-multiple-high-indicators",
    description: "Escalate when 3 or more high-severity fraud indicators are present",
    field: "decision.recommendation",
    conditions: [
      { field: "fraud.highSeverityIndicatorCount", operator: "gte", value: 3 },
    ],
    priority: 8,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "require_approval",
    conflictSeverity: "HIGH",
    confidenceImpact: -10,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Multiple high-severity fraud indicators require senior approval even if individual score is below threshold",
    applicableProfiles: [],
    enabled: true,
  },

  // ── COST RULES ────────────────────────────────────────────────────────────
  {
    ruleId: "cost-high-deviation-review",
    description: "Flag for review when quote deviates > 30% from expected",
    field: "cost.optimisedCostUsd",
    conditions: [
      { field: "cost.quoteDeviationPct", operator: "exists" },
      { field: "cost.quoteDeviationPct", operator: "gt", value: 30 },
    ],
    priority: 15,
    canonicalOwner: "stage9_cost",
    resolution: "require_approval",
    conflictSeverity: "HIGH",
    confidenceImpact: -8,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Quote deviations > 30% from expected cost require cost review before payment",
    applicableProfiles: [],
    enabled: true,
  },

  // ── EVIDENCE RULES ────────────────────────────────────────────────────────
  {
    ruleId: "evidence-no-photos-advisory",
    description: "Add advisory when no damage photos are available",
    field: "damage.visionSourceReliability",
    conditions: [
      { field: "evidence.photoCount", operator: "eq", value: 0 },
    ],
    priority: 25,
    canonicalOwner: "stage6_damage_analysis",
    resolution: "suppress_advisory",
    conflictSeverity: "MEDIUM",
    confidenceImpact: -12,
    auditRequired: false,
    blocksPublication: false,
    rationale: "No damage photos means damage assessment is based on documents only — lower confidence",
    applicableProfiles: [],
    enabled: true,
  },
  {
    ruleId: "evidence-no-quotation-advisory",
    description: "Add advisory when no repair quotation is available",
    field: "cost.optimisedCostUsd",
    conditions: [
      { field: "evidence.hasQuotation", operator: "eq", value: false },
    ],
    priority: 30,
    canonicalOwner: "stage9_cost",
    resolution: "suppress_advisory",
    conflictSeverity: "LOW",
    confidenceImpact: -5,
    auditRequired: false,
    blocksPublication: false,
    rationale: "No quotation means cost estimate is system-generated only — flag for review",
    applicableProfiles: [],
    enabled: true,
  },

  // ── TEMPORAL RULES ────────────────────────────────────────────────────────
  {
    ruleId: "late-submission-review",
    description: "Flag for review when claim is submitted late",
    field: "workflow.lateSubmission",
    conditions: [
      { field: "claim.lateSubmission", operator: "eq", value: true },
    ],
    priority: 35,
    canonicalOwner: "claim_truth_layer",
    resolution: "require_approval",
    conflictSeverity: "MEDIUM",
    confidenceImpact: -5,
    auditRequired: false,
    blocksPublication: false,
    rationale: "Late submissions require explanation and approval per standard claims handling procedures",
    applicableProfiles: [],
    enabled: true,
  },

  // ── CONSISTENCY RULES ─────────────────────────────────────────────────────
  {
    ruleId: "consistency-block-auto-approval",
    description: "Block auto-approval when consistency engine flags contradictions",
    field: "decision.recommendation",
    conditions: [
      { field: "consistency.blockAutoApproval", operator: "eq", value: true },
    ],
    priority: 12,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "require_approval",
    conflictSeverity: "HIGH",
    confidenceImpact: -10,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Cross-stage consistency contradictions must be resolved before auto-approval",
    applicableProfiles: [],
    enabled: true,
  },
  {
    ruleId: "consistency-critical-conflict-block",
    description: "Block publication when critical consistency conflicts are present",
    field: "decision.recommendation",
    conditions: [
      { field: "consistency.criticalConflictCount", operator: "gte", value: 1 },
    ],
    priority: 3,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "block_publication",
    conflictSeverity: "CRITICAL",
    confidenceImpact: -25,
    auditRequired: true,
    blocksPublication: true,
    rationale: "Critical consistency conflicts indicate fundamental data integrity issues that must be resolved before publication",
    applicableProfiles: [],
    enabled: true,
  },

  // ── STRUCTURAL DAMAGE RULES ───────────────────────────────────────────────
  {
    ruleId: "structural-damage-escalation",
    description: "Escalate when structural damage is detected",
    field: "damage.severity",
    conditions: [
      { field: "damage.structuralDamageDetected", operator: "eq", value: true },
    ],
    priority: 18,
    canonicalOwner: "stage7_physics",
    resolution: "require_approval",
    conflictSeverity: "HIGH",
    confidenceImpact: 0,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Structural damage claims require engineering review before settlement",
    applicableProfiles: [],
    enabled: true,
  },

  // ── ZIMBABWE-SPECIFIC RULES ───────────────────────────────────────────────
  {
    ruleId: "zw-mandatory-two-level-approval",
    description: "[Zimbabwe] Require two-level approval for claims above USD 5,000",
    field: "decision.recommendation",
    conditions: [
      { field: "cost.optimisedCostUsd", operator: "gte", value: 5000 },
    ],
    priority: 22,
    canonicalOwner: "truth_reconciliation_engine",
    resolution: "require_approval",
    conflictSeverity: "MEDIUM",
    confidenceImpact: 0,
    auditRequired: true,
    blocksPublication: false,
    rationale: "Zimbabwe Insurance Council requires two-level approval for claims above USD 5,000",
    applicableProfiles: ["zimbabwe_insurance", "zambia_insurance"],
    enabled: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION EVALUATOR
// ─────────────────────────────────────────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(condition: RuleCondition, context: TruthRuleContext): { passed: boolean; actualValue: unknown } {
  const actualValue = getNestedValue(context, condition.field);
  let passed = false;

  switch (condition.operator) {
    case "gt":   passed = typeof actualValue === "number" && actualValue > (condition.value as number); break;
    case "gte":  passed = typeof actualValue === "number" && actualValue >= (condition.value as number); break;
    case "lt":   passed = typeof actualValue === "number" && actualValue < (condition.value as number); break;
    case "lte":  passed = typeof actualValue === "number" && actualValue <= (condition.value as number); break;
    case "eq":   passed = actualValue === condition.value; break;
    case "neq":  passed = actualValue !== condition.value; break;
    case "exists": passed = actualValue !== null && actualValue !== undefined; break;
    case "missing": passed = actualValue === null || actualValue === undefined; break;
    case "in":   passed = Array.isArray(condition.value) && condition.value.includes(actualValue); break;
    case "not_in": passed = Array.isArray(condition.value) && !condition.value.includes(actualValue); break;
    default:     passed = false;
  }

  return { passed, actualValue };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a TruthRuleContext from engine outputs.
 * This is the flattened view that rules operate on.
 */
export function buildTruthRuleContext(
  physicsConfidence: number | null,
  physicsSpeedKmh: number | null,
  physicsStatus: string,
  damageConsistencyScore: number,
  visionSourceReliability: "HIGH" | "MEDIUM" | "LOW" | "NONE",
  fraudScore: number,
  fraudLevel: string,
  fraudIndicators: Array<{ severity: string }>,
  costUsd: number,
  costConfidence: number | null,
  costRecommendation: string,
  quoteDeviationPct: number | null,
  damageSeverity: string,
  structuralDamageDetected: boolean,
  componentCount: number,
  photoCount: number,
  documentCount: number,
  evidenceCompleteness: number,
  hasQuotation: boolean,
  claimAgeDays: number | null,
  lateSubmission: boolean,
  incidentType: string | null,
  policyNumber: string | null,
  blockAutoApproval: boolean,
  criticalConflictCount: number,
  highConflictCount: number,
  ctlDecision: string | null,
  ctlFraudScore: number | null,
  s9Decision: string | null,
  s9CostUsd: number
): TruthRuleContext {
  return {
    physics: {
      confidence: physicsConfidence,
      speedKmh: physicsSpeedKmh,
      status: physicsStatus,
      damageConsistencyScore,
      supportingEvidenceAvailable: visionSourceReliability === "HIGH" || visionSourceReliability === "MEDIUM",
      visionSourceReliability,
    },
    fraud: {
      score: fraudScore,
      level: fraudLevel,
      indicatorCount: fraudIndicators.length,
      highSeverityIndicatorCount: fraudIndicators.filter(i => i.severity === "HIGH" || i.severity === "CRITICAL").length,
    },
    cost: {
      optimisedCostUsd: costUsd,
      confidence: costConfidence,
      recommendation: costRecommendation,
      quoteDeviationPct,
    },
    damage: {
      severity: damageSeverity,
      structuralDamageDetected,
      componentCount,
      hasConfirmedDamagePhotos: photoCount > 0 && visionSourceReliability !== "NONE",
    },
    evidence: {
      photoCount,
      documentCount,
      completenessScore: evidenceCompleteness,
      hasQuotation,
    },
    claim: {
      ageDays: claimAgeDays,
      lateSubmission,
      incidentType,
      policyNumber,
    },
    consistency: {
      blockAutoApproval,
      criticalConflictCount,
      highConflictCount,
    },
    ctl: {
      decision: ctlDecision,
      fraudScore: ctlFraudScore,
    },
    stage9: {
      decision: s9Decision,
      costUsd: s9CostUsd,
    },
  };
}

/**
 * Evaluate all truth rules against the given context.
 * Returns a TruthRuleEngineResult with all fired rules and field decisions.
 */
export function evaluateTruthRules(
  context: TruthRuleContext,
  rules: TruthRule[] = BUILT_IN_TRUTH_RULES,
  activeProfileName?: string
): TruthRuleEngineResult {
  const now = new Date().toISOString();
  const firedRules: TruthRuleResult[] = [];
  const skippedRules: TruthRuleResult[] = [];
  const fieldDecisions: Record<string, TruthRuleResult> = {};
  const auditRecords: Array<{ ruleId: string; field: string; timestamp: string; explanation: string }> = [];

  // Sort rules by priority (ascending — lower number fires first)
  const sortedRules = [...rules]
    .filter(r => r.enabled)
    .filter(r => r.applicableProfiles.length === 0 || (activeProfileName && r.applicableProfiles.includes(activeProfileName)))
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    const conditionResults = rule.conditions.map(c => ({
      condition: c,
      ...evaluateCondition(c, context),
    }));

    const allPassed = conditionResults.every(r => r.passed);
    const explanation = allPassed
      ? `Rule "${rule.ruleId}" fired: ${rule.description}. Conditions: ${conditionResults.map(r => `${r.condition.field} ${r.condition.operator} ${r.condition.value} → ${r.passed} (actual: ${JSON.stringify(r.actualValue)})`).join("; ")}`
      : `Rule "${rule.ruleId}" skipped: ${conditionResults.filter(r => !r.passed).map(r => `${r.condition.field} ${r.condition.operator} ${r.condition.value} failed (actual: ${JSON.stringify(r.actualValue)})`).join("; ")}`;

    const result: TruthRuleResult = {
      ruleId: rule.ruleId,
      field: rule.field,
      fired: allPassed,
      canonicalOwner: rule.canonicalOwner,
      resolution: rule.resolution,
      conflictSeverity: rule.conflictSeverity,
      confidenceImpact: rule.confidenceImpact,
      blocksPublication: rule.blocksPublication && allPassed,
      auditRequired: rule.auditRequired,
      explanation,
      conditionResults,
    };

    if (allPassed) {
      firedRules.push(result);
      // First fired rule per field wins
      if (!fieldDecisions[rule.field]) {
        fieldDecisions[rule.field] = result;
      }
      if (rule.auditRequired) {
        auditRecords.push({ ruleId: rule.ruleId, field: rule.field, timestamp: now, explanation });
      }
    } else {
      skippedRules.push(result);
    }
  }

  const totalConfidenceImpact = firedRules.reduce((sum, r) => sum + r.confidenceImpact, 0);
  const blocksPublication = firedRules.some(r => r.blocksPublication);

  return { firedRules, skippedRules, totalConfidenceImpact, blocksPublication, fieldDecisions, auditRecords };
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE REGISTRY (extensible — custom rules can be added at runtime)
// ─────────────────────────────────────────────────────────────────────────────

let _customRules: TruthRule[] = [];

export function registerCustomRule(rule: TruthRule): void {
  const existing = _customRules.findIndex(r => r.ruleId === rule.ruleId);
  if (existing >= 0) {
    _customRules[existing] = rule;
  } else {
    _customRules.push(rule);
  }
}

export function getActiveRules(): TruthRule[] {
  return [...BUILT_IN_TRUTH_RULES, ..._customRules];
}

export function getRuleById(ruleId: string): TruthRule | undefined {
  return getActiveRules().find(r => r.ruleId === ruleId);
}

export function disableRule(ruleId: string): boolean {
  const rule = getActiveRules().find(r => r.ruleId === ruleId);
  if (!rule) return false;
  rule.enabled = false;
  return true;
}
