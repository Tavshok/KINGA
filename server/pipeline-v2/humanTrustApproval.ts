/**
 * TRE v4.0 — Enhancement 4: Human-in-the-Loop Governance
 *
 * Defines approval workflows, escalation chains, and override audit trails
 * for trust decisions that require human judgment. Integrates with the
 * Trust Event Bus and Resolution Queue.
 */

import { trustEventBus, humanReviewRequestedEvent } from "./trustEventBus";
import { trustResolutionQueue, createResolutionTask } from "./trustResolutionQueue";
import type { ResolutionOwnerRole } from "./trustResolutionQueue";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "ESCALATED"
  | "EXPIRED"
  | "WITHDRAWN";

export type ApprovalTrigger =
  | "FRAUD_SCORE_HIGH"
  | "COST_THRESHOLD_EXCEEDED"
  | "REGULATORY_COMPLIANCE_FAILURE"
  | "CERTIFICATE_BLOCKED"
  | "ASSESSOR_OVERRIDE_REQUESTED"
  | "CONFLICT_UNRESOLVABLE"
  | "MODEL_DRIFT_CRITICAL"
  | "SLA_BREACH_CRITICAL"
  | "MANUAL_ESCALATION";

export type ApprovalDecision = "APPROVE" | "REJECT" | "ESCALATE" | "REQUEST_MORE_INFO";

export interface ApprovalCondition {
  trigger: ApprovalTrigger;
  description: string;
  requiredRole: ResolutionOwnerRole;
  slaMinutes: number;
  autoEscalateAfterMinutes: number;
  escalateTo: ResolutionOwnerRole;
  requiresDocumentation: boolean;
}

export interface HumanApprovalRequest {
  requestId: string;
  claimId: string;
  assessmentId?: string;
  trigger: ApprovalTrigger;
  status: ApprovalStatus;
  requiredRole: ResolutionOwnerRole;
  assignedTo?: string;
  requestedAt: string;
  deadlineAt: string;
  resolvedAt?: string;
  decision?: ApprovalDecision;
  decisionNotes?: string;
  decisionBy?: string;
  contextSummary: string;
  supportingData: Record<string, unknown>;
  escalationChain: EscalationStep[];
  overrideAuditTrail: OverrideAuditEntry[];
  correlationId?: string;
}

export interface EscalationStep {
  stepNumber: number;
  escalatedAt: string;
  escalatedFrom: ResolutionOwnerRole;
  escalatedTo: ResolutionOwnerRole;
  reason: string;
  autoEscalated: boolean;
}

export interface OverrideAuditEntry {
  entryId: string;
  timestamp: string;
  actor: string;
  actorRole: ResolutionOwnerRole;
  action: string;
  fieldOverridden?: string;
  previousValue?: unknown;
  newValue?: unknown;
  justification: string;
  ipAddress?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval conditions registry
// ─────────────────────────────────────────────────────────────────────────────

export const APPROVAL_CONDITIONS: Record<ApprovalTrigger, ApprovalCondition> = {
  FRAUD_SCORE_HIGH: {
    trigger: "FRAUD_SCORE_HIGH",
    description: "Fraud risk score exceeds 70 — requires fraud analyst review",
    requiredRole: "FRAUD_ANALYST",
    slaMinutes: 240,
    autoEscalateAfterMinutes: 180,
    escalateTo: "CLAIMS_MANAGER",
    requiresDocumentation: true,
  },
  COST_THRESHOLD_EXCEEDED: {
    trigger: "COST_THRESHOLD_EXCEEDED",
    description: "Claim cost exceeds authorisation threshold — requires manager approval",
    requiredRole: "CLAIMS_MANAGER",
    slaMinutes: 480,
    autoEscalateAfterMinutes: 360,
    escalateTo: "SENIOR_ASSESSOR",
    requiresDocumentation: true,
  },
  REGULATORY_COMPLIANCE_FAILURE: {
    trigger: "REGULATORY_COMPLIANCE_FAILURE",
    description: "Regulatory compliance failure — requires compliance officer review",
    requiredRole: "COMPLIANCE_OFFICER",
    slaMinutes: 60,
    autoEscalateAfterMinutes: 45,
    escalateTo: "CLAIMS_MANAGER",
    requiresDocumentation: true,
  },
  CERTIFICATE_BLOCKED: {
    trigger: "CERTIFICATE_BLOCKED",
    description: "Truth Certificate blocked — requires senior assessor review",
    requiredRole: "SENIOR_ASSESSOR",
    slaMinutes: 120,
    autoEscalateAfterMinutes: 90,
    escalateTo: "CLAIMS_MANAGER",
    requiresDocumentation: true,
  },
  ASSESSOR_OVERRIDE_REQUESTED: {
    trigger: "ASSESSOR_OVERRIDE_REQUESTED",
    description: "Assessor override requested — requires manager approval",
    requiredRole: "CLAIMS_MANAGER",
    slaMinutes: 240,
    autoEscalateAfterMinutes: 180,
    escalateTo: "SENIOR_ASSESSOR",
    requiresDocumentation: true,
  },
  CONFLICT_UNRESOLVABLE: {
    trigger: "CONFLICT_UNRESOLVABLE",
    description: "Automated reconciliation failed — requires human resolution",
    requiredRole: "SENIOR_ASSESSOR",
    slaMinutes: 480,
    autoEscalateAfterMinutes: 360,
    escalateTo: "CLAIMS_MANAGER",
    requiresDocumentation: true,
  },
  MODEL_DRIFT_CRITICAL: {
    trigger: "MODEL_DRIFT_CRITICAL",
    description: "Critical AI model drift detected — requires compliance review",
    requiredRole: "COMPLIANCE_OFFICER",
    slaMinutes: 60,
    autoEscalateAfterMinutes: 30,
    escalateTo: "CLAIMS_MANAGER",
    requiresDocumentation: true,
  },
  SLA_BREACH_CRITICAL: {
    trigger: "SLA_BREACH_CRITICAL",
    description: "Critical SLA breach — requires manager intervention",
    requiredRole: "CLAIMS_MANAGER",
    slaMinutes: 30,
    autoEscalateAfterMinutes: 20,
    escalateTo: "SENIOR_ASSESSOR",
    requiresDocumentation: false,
  },
  MANUAL_ESCALATION: {
    trigger: "MANUAL_ESCALATION",
    description: "Manual escalation by assessor",
    requiredRole: "CLAIMS_MANAGER",
    slaMinutes: 480,
    autoEscalateAfterMinutes: 360,
    escalateTo: "SENIOR_ASSESSOR",
    requiresDocumentation: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Approval request factory
// ─────────────────────────────────────────────────────────────────────────────

let _requestCounter = 0;

function nextRequestId(): string {
  _requestCounter += 1;
  return `APPROVAL-${String(_requestCounter).padStart(6, "0")}`;
}

export function createApprovalRequest(
  claimId: string,
  trigger: ApprovalTrigger,
  contextSummary: string,
  supportingData: Record<string, unknown> = {},
  assessmentId?: string
): HumanApprovalRequest {
  const condition = APPROVAL_CONDITIONS[trigger];
  const now = new Date();
  const deadline = new Date(now.getTime() + condition.slaMinutes * 60 * 1000);

  return {
    requestId: nextRequestId(),
    claimId,
    assessmentId,
    trigger,
    status: "PENDING",
    requiredRole: condition.requiredRole,
    requestedAt: now.toISOString(),
    deadlineAt: deadline.toISOString(),
    contextSummary,
    supportingData,
    escalationChain: [],
    overrideAuditTrail: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval workflow engine
// ─────────────────────────────────────────────────────────────────────────────

class HumanTrustApprovalEngineImpl {
  private requests: Map<string, HumanApprovalRequest> = new Map();

  async request(
    claimId: string,
    trigger: ApprovalTrigger,
    contextSummary: string,
    supportingData: Record<string, unknown> = {},
    assessmentId?: string
  ): Promise<HumanApprovalRequest> {
    const req = createApprovalRequest(claimId, trigger, contextSummary, supportingData, assessmentId);
    this.requests.set(req.requestId, req);

    // Create a resolution task
    const condition = APPROVAL_CONDITIONS[trigger];
    const task = createResolutionTask({
      claimId,
      assessmentId,
      type: "HUMAN_APPROVAL",
      priority: trigger === "REGULATORY_COMPLIANCE_FAILURE" || trigger === "FRAUD_SCORE_HIGH" ? "CRITICAL" : "HIGH",
      title: `Human Approval Required: ${trigger}`,
      description: contextSummary,
      requiredAction: condition.description,
      ownerRole: condition.requiredRole,
      evidenceRequired: condition.requiresDocumentation ? ["Decision documentation"] : [],
      evidenceProvided: [],
      affectedSections: ["certification", "decision"],
      slaTargetMinutes: condition.slaMinutes,
      correlationId: req.requestId,
    });
    trustResolutionQueue.enqueue(task);

    // Publish event
    await trustEventBus.publish(
      humanReviewRequestedEvent(claimId, trigger, contextSummary, condition.requiredRole)
    );

    return req;
  }

  decide(
    requestId: string,
    decision: ApprovalDecision,
    decisionBy: string,
    decisionNotes: string
  ): HumanApprovalRequest | null {
    const req = this.requests.get(requestId);
    if (!req) return null;

    const now = new Date().toISOString();
    const auditEntry: OverrideAuditEntry = {
      entryId: `AUDIT-${Date.now()}`,
      timestamp: now,
      actor: decisionBy,
      actorRole: req.requiredRole,
      action: `DECISION: ${decision}`,
      justification: decisionNotes,
    };

    const updated: HumanApprovalRequest = {
      ...req,
      status: decision === "APPROVE" ? "APPROVED" :
               decision === "REJECT" ? "REJECTED" :
               decision === "ESCALATE" ? "ESCALATED" : "PENDING",
      decision,
      decisionNotes,
      decisionBy,
      resolvedAt: decision !== "ESCALATE" ? now : undefined,
      overrideAuditTrail: [...req.overrideAuditTrail, auditEntry],
    };

    this.requests.set(requestId, updated);
    return updated;
  }

  escalate(
    requestId: string,
    reason: string,
    autoEscalated = false
  ): HumanApprovalRequest | null {
    const req = this.requests.get(requestId);
    if (!req) return null;

    const condition = APPROVAL_CONDITIONS[req.trigger];
    const step: EscalationStep = {
      stepNumber: req.escalationChain.length + 1,
      escalatedAt: new Date().toISOString(),
      escalatedFrom: req.requiredRole,
      escalatedTo: condition.escalateTo,
      reason,
      autoEscalated,
    };

    const updated: HumanApprovalRequest = {
      ...req,
      status: "ESCALATED",
      requiredRole: condition.escalateTo,
      escalationChain: [...req.escalationChain, step],
    };

    this.requests.set(requestId, updated);
    return updated;
  }

  recordOverride(
    requestId: string,
    actor: string,
    actorRole: ResolutionOwnerRole,
    action: string,
    justification: string,
    fieldOverridden?: string,
    previousValue?: unknown,
    newValue?: unknown
  ): HumanApprovalRequest | null {
    const req = this.requests.get(requestId);
    if (!req) return null;

    const entry: OverrideAuditEntry = {
      entryId: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      actor,
      actorRole,
      action,
      fieldOverridden,
      previousValue,
      newValue,
      justification,
    };

    const updated: HumanApprovalRequest = {
      ...req,
      overrideAuditTrail: [...req.overrideAuditTrail, entry],
    };

    this.requests.set(requestId, updated);
    return updated;
  }

  getRequest(requestId: string): HumanApprovalRequest | undefined {
    return this.requests.get(requestId);
  }

  getClaimRequests(claimId: string): HumanApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.claimId === claimId);
  }

  getPendingRequests(role?: ResolutionOwnerRole): HumanApprovalRequest[] {
    return [...this.requests.values()].filter(
      (r) =>
        r.status === "PENDING" &&
        (!role || r.requiredRole === role)
    );
  }

  checkAutoEscalations(): void {
    const now = Date.now();
    for (const req of this.requests.values()) {
      if (req.status !== "PENDING") continue;
      const condition = APPROVAL_CONDITIONS[req.trigger];
      const age = (now - new Date(req.requestedAt).getTime()) / 60000;
      if (age >= condition.autoEscalateAfterMinutes) {
        this.escalate(req.requestId, `Auto-escalated after ${condition.autoEscalateAfterMinutes}min`, true);
      }
    }
  }

  clear(): void {
    this.requests.clear();
  }
}

export const humanTrustApprovalEngine = new HumanTrustApprovalEngineImpl();

// ─────────────────────────────────────────────────────────────────────────────
// Approval trigger evaluators
// ─────────────────────────────────────────────────────────────────────────────

export interface ApprovalRequirement {
  required: boolean;
  trigger?: ApprovalTrigger;
  reason?: string;
}

export function evaluateApprovalRequirements(params: {
  fraudScore?: number;
  costUsd?: number;
  costThresholdUsd?: number;
  certificateBlocked?: boolean;
  regulatoryFailures?: string[];
}): ApprovalRequirement[] {
  const requirements: ApprovalRequirement[] = [];

  if ((params.fraudScore ?? 0) >= 70) {
    requirements.push({
      required: true,
      trigger: "FRAUD_SCORE_HIGH",
      reason: `Fraud score ${params.fraudScore} ≥ 70`,
    });
  }

  if (params.costUsd && params.costThresholdUsd && params.costUsd > params.costThresholdUsd) {
    requirements.push({
      required: true,
      trigger: "COST_THRESHOLD_EXCEEDED",
      reason: `Cost $${params.costUsd.toFixed(2)} exceeds threshold $${params.costThresholdUsd.toFixed(2)}`,
    });
  }

  if (params.certificateBlocked) {
    requirements.push({
      required: true,
      trigger: "CERTIFICATE_BLOCKED",
      reason: "Truth Certificate is in BLOCKED state",
    });
  }

  if (params.regulatoryFailures && params.regulatoryFailures.length > 0) {
    requirements.push({
      required: true,
      trigger: "REGULATORY_COMPLIANCE_FAILURE",
      reason: `${params.regulatoryFailures.length} regulatory rule(s) failed`,
    });
  }

  return requirements;
}
