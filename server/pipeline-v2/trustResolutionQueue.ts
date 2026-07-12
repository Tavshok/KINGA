/**
 * TRE v4.0 — Enhancement 3: Autonomous Reconciliation Queue
 *
 * Instead of only reporting conflicts, TRE creates resolution tasks with
 * assignment, escalation, SLA monitoring, and resolution tracking.
 */

export type ResolutionTaskStatus =
  | "PENDING"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_EVIDENCE"
  | "ESCALATED"
  | "RESOLVED"
  | "CLOSED"
  | "EXPIRED";

export type ResolutionTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ResolutionTaskType =
  | "CONFLICT_RESOLUTION"
  | "EVIDENCE_REVIEW"
  | "MANUAL_OVERRIDE_REVIEW"
  | "FRAUD_INVESTIGATION"
  | "REGULATORY_COMPLIANCE"
  | "CERTIFICATE_REGENERATION"
  | "MODEL_DRIFT_REVIEW"
  | "SLA_BREACH_RESPONSE"
  | "HUMAN_APPROVAL";

export type ResolutionOwnerRole =
  | "FRAUD_ANALYST"
  | "CLAIMS_ASSESSOR"
  | "CLAIMS_MANAGER"
  | "COMPLIANCE_OFFICER"
  | "SENIOR_ASSESSOR"
  | "SYSTEM";

export interface ResolutionTask {
  taskId: string;
  claimId: string;
  assessmentId?: string;
  type: ResolutionTaskType;
  priority: ResolutionTaskPriority;
  status: ResolutionTaskStatus;
  title: string;
  description: string;
  requiredAction: string;
  ownerRole: ResolutionOwnerRole;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string;
  resolvedAt?: string;
  escalatedAt?: string;
  escalationReason?: string;
  resolutionNotes?: string;
  evidenceRequired: string[];
  evidenceProvided: string[];
  conflictDescription?: string;
  affectedSections: string[];
  slaTargetMinutes: number;
  slaStatus: "ON_TRACK" | "AT_RISK" | "BREACHED";
  escalationCount: number;
  correlationId?: string;
}

export interface ResolutionQueueStats {
  totalTasks: number;
  byStatus: Record<ResolutionTaskStatus, number>;
  byPriority: Record<ResolutionTaskPriority, number>;
  slaBreachedCount: number;
  averageResolutionMinutes: number;
  oldestPendingAgeMinutes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA targets by priority (minutes)
// ─────────────────────────────────────────────────────────────────────────────

const SLA_TARGETS: Record<ResolutionTaskPriority, number> = {
  CRITICAL: 60,
  HIGH: 240,
  MEDIUM: 1440,
  LOW: 4320,
};

// ─────────────────────────────────────────────────────────────────────────────
// Task factory
// ─────────────────────────────────────────────────────────────────────────────

let _taskCounter = 0;

function nextTaskId(): string {
  _taskCounter += 1;
  return `TASK-${String(_taskCounter).padStart(6, "0")}`;
}

export function createResolutionTask(
  partial: Omit<
    ResolutionTask,
    | "taskId"
    | "createdAt"
    | "updatedAt"
    | "deadlineAt"
    | "slaStatus"
    | "escalationCount"
    | "status"
  > & { status?: ResolutionTaskStatus }
): ResolutionTask {
  const now = new Date();
  const slaMinutes = SLA_TARGETS[partial.priority];
  const deadline = new Date(now.getTime() + slaMinutes * 60 * 1000);

  return {
    taskId: nextTaskId(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deadlineAt: deadline.toISOString(),
    slaStatus: "ON_TRACK",
    escalationCount: 0,
    status: "PENDING",
    ...partial,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict → task mapper
// ─────────────────────────────────────────────────────────────────────────────

export function createConflictResolutionTask(
  claimId: string,
  conflictDescription: string,
  affectedSections: string[],
  priority: ResolutionTaskPriority = "HIGH"
): ResolutionTask {
  const ownerRole: ResolutionOwnerRole =
    priority === "CRITICAL" ? "CLAIMS_MANAGER" :
    conflictDescription.toLowerCase().includes("fraud") ? "FRAUD_ANALYST" :
    "CLAIMS_ASSESSOR";

  return createResolutionTask({
    claimId,
    type: "CONFLICT_RESOLUTION",
    priority,
    title: `Conflict: ${conflictDescription.slice(0, 80)}`,
    description: `A truth conflict has been detected that requires manual resolution: ${conflictDescription}`,
    requiredAction: "Review conflicting evidence, determine canonical value, and document resolution rationale.",
    ownerRole,
    evidenceRequired: ["Supporting documentation", "Assessor notes"],
    evidenceProvided: [],
    conflictDescription,
    affectedSections,
    slaTargetMinutes: SLA_TARGETS[priority],
  });
}

export function createFraudInvestigationTask(
  claimId: string,
  fraudScore: number,
  fraudIndicators: string[]
): ResolutionTask {
  const priority: ResolutionTaskPriority = fraudScore >= 80 ? "CRITICAL" : "HIGH";
  return createResolutionTask({
    claimId,
    type: "FRAUD_INVESTIGATION",
    priority,
    title: `Fraud Investigation — Score: ${fraudScore}`,
    description: `Elevated fraud risk score (${fraudScore}/100) with ${fraudIndicators.length} indicator(s): ${fraudIndicators.slice(0, 3).join(", ")}`,
    requiredAction: "Conduct fraud investigation, review all evidence, and escalate to compliance if confirmed.",
    ownerRole: "FRAUD_ANALYST",
    evidenceRequired: ["Original claim documents", "Damage photos", "Telematics data", "Witness statements"],
    evidenceProvided: [],
    affectedSections: ["fraud", "decision", "certification"],
    slaTargetMinutes: SLA_TARGETS[priority],
  });
}

export function createCertificateRegenerationTask(
  claimId: string,
  reason: string
): ResolutionTask {
  return createResolutionTask({
    claimId,
    type: "CERTIFICATE_REGENERATION",
    priority: "HIGH",
    title: `Certificate Regeneration Required`,
    description: `The Truth Certificate for claim ${claimId} must be regenerated: ${reason}`,
    requiredAction: "Trigger full TRE re-run after all conflicts are resolved.",
    ownerRole: "SYSTEM",
    evidenceRequired: [],
    evidenceProvided: [],
    affectedSections: ["certification"],
    slaTargetMinutes: SLA_TARGETS["HIGH"],
  });
}

export function createRegulatoryComplianceTask(
  claimId: string,
  jurisdiction: string,
  failedRules: string[]
): ResolutionTask {
  return createResolutionTask({
    claimId,
    type: "REGULATORY_COMPLIANCE",
    priority: "CRITICAL",
    title: `Regulatory Compliance Failure — ${jurisdiction}`,
    description: `Claim ${claimId} failed ${failedRules.length} regulatory rule(s) for ${jurisdiction}: ${failedRules.join(", ")}`,
    requiredAction: "Review regulatory requirements, remediate failures, and re-submit for compliance validation.",
    ownerRole: "COMPLIANCE_OFFICER",
    evidenceRequired: ["Compliance documentation", "Regulatory correspondence"],
    evidenceProvided: [],
    affectedSections: ["certification", "decision"],
    slaTargetMinutes: SLA_TARGETS["CRITICAL"],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory queue (production would use DB-backed queue)
// ─────────────────────────────────────────────────────────────────────────────

class TrustResolutionQueueImpl {
  private tasks: Map<string, ResolutionTask> = new Map();

  enqueue(task: ResolutionTask): ResolutionTask {
    this.tasks.set(task.taskId, task);
    return task;
  }

  getTask(taskId: string): ResolutionTask | undefined {
    return this.tasks.get(taskId);
  }

  getClaimTasks(claimId: string): ResolutionTask[] {
    return [...this.tasks.values()].filter((t) => t.claimId === claimId);
  }

  getPendingTasks(ownerRole?: ResolutionOwnerRole): ResolutionTask[] {
    return [...this.tasks.values()].filter(
      (t) =>
        (t.status === "PENDING" || t.status === "ASSIGNED" || t.status === "IN_PROGRESS") &&
        (!ownerRole || t.ownerRole === ownerRole)
    );
  }

  assign(taskId: string, assignedTo: string): ResolutionTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const updated: ResolutionTask = {
      ...task,
      status: "ASSIGNED",
      assignedTo,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  resolve(taskId: string, notes: string, evidenceProvided: string[] = []): ResolutionTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    const updated: ResolutionTask = {
      ...task,
      status: "RESOLVED",
      resolvedAt: now,
      updatedAt: now,
      resolutionNotes: notes,
      evidenceProvided: [...task.evidenceProvided, ...evidenceProvided],
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  escalate(taskId: string, reason: string): ResolutionTask | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    const now = new Date().toISOString();
    const updated: ResolutionTask = {
      ...task,
      status: "ESCALATED",
      escalatedAt: now,
      updatedAt: now,
      escalationReason: reason,
      escalationCount: task.escalationCount + 1,
      ownerRole: "CLAIMS_MANAGER",
      priority: task.priority === "HIGH" ? "CRITICAL" : task.priority,
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  updateSlaStatuses(): void {
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === "RESOLVED" || task.status === "CLOSED") continue;
      const deadline = new Date(task.deadlineAt).getTime();
      const timeLeft = deadline - now;
      const slaStatus: ResolutionTask["slaStatus"] =
        timeLeft < 0 ? "BREACHED" :
        timeLeft < task.slaTargetMinutes * 60 * 1000 * 0.2 ? "AT_RISK" :
        "ON_TRACK";
      if (slaStatus !== task.slaStatus) {
        this.tasks.set(id, { ...task, slaStatus, updatedAt: new Date().toISOString() });
      }
    }
  }

  getStats(): ResolutionQueueStats {
    this.updateSlaStatuses();
    const all = [...this.tasks.values()];

    const byStatus = {} as Record<ResolutionTaskStatus, number>;
    const byPriority = {} as Record<ResolutionTaskPriority, number>;
    let totalResolutionMinutes = 0;
    let resolvedCount = 0;
    let oldestPendingMs = 0;

    for (const task of all) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;

      if (task.status === "RESOLVED" && task.resolvedAt) {
        const mins =
          (new Date(task.resolvedAt).getTime() - new Date(task.createdAt).getTime()) / 60000;
        totalResolutionMinutes += mins;
        resolvedCount += 1;
      }

      if (task.status === "PENDING") {
        const ageMs = Date.now() - new Date(task.createdAt).getTime();
        if (ageMs > oldestPendingMs) oldestPendingMs = ageMs;
      }
    }

    return {
      totalTasks: all.length,
      byStatus,
      byPriority,
      slaBreachedCount: all.filter((t) => t.slaStatus === "BREACHED").length,
      averageResolutionMinutes: resolvedCount > 0 ? totalResolutionMinutes / resolvedCount : 0,
      oldestPendingAgeMinutes: oldestPendingMs / 60000,
    };
  }

  clear(): void {
    this.tasks.clear();
  }
}

export const trustResolutionQueue = new TrustResolutionQueueImpl();
