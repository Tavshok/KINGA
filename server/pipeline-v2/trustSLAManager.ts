/**
 * TRE v4.0 — Enhancement 7: Trust SLA Management
 *
 * Defines, tracks, and enforces SLA targets for every trust operation.
 * Generates breach alerts, SLA performance reports, and escalation triggers.
 */

import { trustEventBus, slaBreachEvent } from "./trustEventBus";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SLAOperationType =
  | "FULL_PIPELINE"
  | "STAGE_6_DAMAGE_ANALYSIS"
  | "STAGE_7_PHYSICS"
  | "STAGE_8_FRAUD"
  | "STAGE_9_COST"
  | "TRE_RECONCILIATION"
  | "HUMAN_REVIEW"
  | "FRAUD_ANALYST_REVIEW"
  | "COMPLIANCE_REVIEW"
  | "REPORT_GENERATION"
  | "CERTIFICATE_ISSUANCE";

export type SLAStatus = "ON_TRACK" | "AT_RISK" | "BREACHED" | "COMPLETED" | "WAIVED";
export type SLATier = "STANDARD" | "PRIORITY" | "CRITICAL" | "REGULATORY";

export interface SLADefinition {
  operationType: SLAOperationType;
  tier: SLATier;
  targetMinutes: number;
  warningThresholdPct: number;  // % of target at which to warn (e.g. 0.8 = 80%)
  escalationThresholdPct: number;  // % at which to escalate (e.g. 1.0 = 100% = breach)
  description: string;
  penaltyOnBreach: string;
  autoEscalateOnBreach: boolean;
}

export interface SLARecord {
  slaId: string;
  claimId: string;
  assessmentId?: string;
  operationType: SLAOperationType;
  tier: SLATier;
  targetMinutes: number;
  startedAt: string;
  completedAt?: string;
  status: SLAStatus;
  elapsedMinutes: number;
  remainingMinutes: number;
  breachMinutes: number;  // 0 if not breached
  percentageUsed: number;
  alerts: SLAAlert[];
  waivedBy?: string;
  waivedReason?: string;
}

export interface SLAAlert {
  alertId: string;
  alertedAt: string;
  alertType: "WARNING" | "BREACH" | "ESCALATION";
  message: string;
  percentageUsed: number;
  remainingMinutes: number;
}

export interface SLAPerformanceReport {
  generatedAt: string;
  periodStartAt: string;
  periodEndAt: string;
  totalOperations: number;
  completedOnTime: number;
  completedLate: number;
  inProgress: number;
  breached: number;
  waived: number;
  overallComplianceRate: number;
  averageCompletionTimeMinutes: number;
  averageBreachMinutes: number;
  byOperationType: Record<SLAOperationType, SLATypeStats>;
  byTier: Record<SLATier, SLATierStats>;
  topBreachingClaims: SLABreachSummary[];
}

export interface SLATypeStats {
  total: number;
  onTime: number;
  breached: number;
  complianceRate: number;
  averageMinutes: number;
}

export interface SLATierStats {
  total: number;
  onTime: number;
  breached: number;
  complianceRate: number;
}

export interface SLABreachSummary {
  claimId: string;
  operationType: SLAOperationType;
  breachMinutes: number;
  tier: SLATier;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA definitions registry
// ─────────────────────────────────────────────────────────────────────────────

export const SLA_DEFINITIONS: Record<SLAOperationType, SLADefinition> = {
  FULL_PIPELINE: {
    operationType: "FULL_PIPELINE",
    tier: "STANDARD",
    targetMinutes: 30,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "End-to-end pipeline from ingestion to report generation",
    penaltyOnBreach: "Notify claims manager and log SLA breach",
    autoEscalateOnBreach: true,
  },
  STAGE_6_DAMAGE_ANALYSIS: {
    operationType: "STAGE_6_DAMAGE_ANALYSIS",
    tier: "STANDARD",
    targetMinutes: 8,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Stage 6 damage analysis including vision processing",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  STAGE_7_PHYSICS: {
    operationType: "STAGE_7_PHYSICS",
    tier: "STANDARD",
    targetMinutes: 3,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Stage 7 physics engine computation",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  STAGE_8_FRAUD: {
    operationType: "STAGE_8_FRAUD",
    tier: "STANDARD",
    targetMinutes: 5,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Stage 8 fraud detection analysis",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  STAGE_9_COST: {
    operationType: "STAGE_9_COST",
    tier: "STANDARD",
    targetMinutes: 5,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Stage 9 cost estimation and quote optimisation",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  TRE_RECONCILIATION: {
    operationType: "TRE_RECONCILIATION",
    tier: "STANDARD",
    targetMinutes: 2,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "TRE reconciliation and certificate generation",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  HUMAN_REVIEW: {
    operationType: "HUMAN_REVIEW",
    tier: "PRIORITY",
    targetMinutes: 240,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Human review of flagged claim",
    penaltyOnBreach: "Auto-escalate to senior assessor",
    autoEscalateOnBreach: true,
  },
  FRAUD_ANALYST_REVIEW: {
    operationType: "FRAUD_ANALYST_REVIEW",
    tier: "PRIORITY",
    targetMinutes: 120,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Fraud analyst review of high-risk claim",
    penaltyOnBreach: "Auto-escalate to fraud manager",
    autoEscalateOnBreach: true,
  },
  COMPLIANCE_REVIEW: {
    operationType: "COMPLIANCE_REVIEW",
    tier: "REGULATORY",
    targetMinutes: 60,
    warningThresholdPct: 0.70,
    escalationThresholdPct: 1.0,
    description: "Compliance officer review of regulatory failure",
    penaltyOnBreach: "Regulatory breach — immediate escalation",
    autoEscalateOnBreach: true,
  },
  REPORT_GENERATION: {
    operationType: "REPORT_GENERATION",
    tier: "STANDARD",
    targetMinutes: 5,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Report generation and PDF rendering",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
  CERTIFICATE_ISSUANCE: {
    operationType: "CERTIFICATE_ISSUANCE",
    tier: "STANDARD",
    targetMinutes: 1,
    warningThresholdPct: 0.75,
    escalationThresholdPct: 1.0,
    description: "Digital Truth Certificate issuance",
    penaltyOnBreach: "Log and continue",
    autoEscalateOnBreach: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SLA Manager
// ─────────────────────────────────────────────────────────────────────────────

class TrustSLAManagerImpl {
  private records: Map<string, SLARecord> = new Map();
  private counter = 0;

  private nextId(): string {
    this.counter += 1;
    return `SLA-${String(this.counter).padStart(6, "0")}`;
  }

  start(
    claimId: string,
    operationType: SLAOperationType,
    assessmentId?: string,
    tierOverride?: SLATier
  ): SLARecord {
    const def = SLA_DEFINITIONS[operationType];
    const record: SLARecord = {
      slaId: this.nextId(),
      claimId,
      assessmentId,
      operationType,
      tier: tierOverride ?? def.tier,
      targetMinutes: def.targetMinutes,
      startedAt: new Date().toISOString(),
      status: "ON_TRACK",
      elapsedMinutes: 0,
      remainingMinutes: def.targetMinutes,
      breachMinutes: 0,
      percentageUsed: 0,
      alerts: [],
    };
    this.records.set(record.slaId, record);
    return record;
  }

  async tick(slaId: string): Promise<SLARecord | null> {
    const record = this.records.get(slaId);
    if (!record || record.status === "COMPLETED" || record.status === "WAIVED") return record ?? null;

    const now = Date.now();
    const elapsedMs = now - new Date(record.startedAt).getTime();
    const elapsedMinutes = elapsedMs / 60000;
    const remainingMinutes = record.targetMinutes - elapsedMinutes;
    const percentageUsed = elapsedMinutes / record.targetMinutes;
    const def = SLA_DEFINITIONS[record.operationType];

    const alerts = [...record.alerts];
    let status: SLAStatus = "ON_TRACK";

    if (percentageUsed >= 1.0) {
      status = "BREACHED";
      const breachMinutes = elapsedMinutes - record.targetMinutes;

      // Add breach alert if not already added
      if (!alerts.some((a) => a.alertType === "BREACH")) {
        alerts.push({
          alertId: `ALERT-${Date.now()}`,
          alertedAt: new Date().toISOString(),
          alertType: "BREACH",
          message: `SLA BREACHED for ${record.operationType} on claim ${record.claimId} — ${breachMinutes.toFixed(1)}min over target`,
          percentageUsed,
          remainingMinutes,
        });

        if (def.autoEscalateOnBreach) {
          await trustEventBus.publish(
            slaBreachEvent(record.claimId, record.operationType, record.targetMinutes, elapsedMinutes)
          );
        }
      }
    } else if (percentageUsed >= def.warningThresholdPct) {
      status = "AT_RISK";

      // Add warning alert if not already added
      if (!alerts.some((a) => a.alertType === "WARNING")) {
        alerts.push({
          alertId: `ALERT-${Date.now()}`,
          alertedAt: new Date().toISOString(),
          alertType: "WARNING",
          message: `SLA at risk for ${record.operationType} on claim ${record.claimId} — ${remainingMinutes.toFixed(1)}min remaining`,
          percentageUsed,
          remainingMinutes,
        });
      }
    }

    const updated: SLARecord = {
      ...record,
      elapsedMinutes,
      remainingMinutes,
      percentageUsed,
      breachMinutes: Math.max(0, elapsedMinutes - record.targetMinutes),
      status,
      alerts,
    };

    this.records.set(slaId, updated);
    return updated;
  }

  complete(slaId: string): SLARecord | null {
    const record = this.records.get(slaId);
    if (!record) return null;

    const now = new Date();
    const elapsedMs = now.getTime() - new Date(record.startedAt).getTime();
    const elapsedMinutes = elapsedMs / 60000;
    const breached = elapsedMinutes > record.targetMinutes;

    const updated: SLARecord = {
      ...record,
      completedAt: now.toISOString(),
      status: breached ? "BREACHED" : "COMPLETED",
      elapsedMinutes,
      remainingMinutes: Math.max(0, record.targetMinutes - elapsedMinutes),
      breachMinutes: Math.max(0, elapsedMinutes - record.targetMinutes),
      percentageUsed: elapsedMinutes / record.targetMinutes,
    };

    this.records.set(slaId, updated);
    return updated;
  }

  waive(slaId: string, waivedBy: string, reason: string): SLARecord | null {
    const record = this.records.get(slaId);
    if (!record) return null;

    const updated: SLARecord = {
      ...record,
      status: "WAIVED",
      waivedBy,
      waivedReason: reason,
    };
    this.records.set(slaId, updated);
    return updated;
  }

  getRecord(slaId: string): SLARecord | undefined {
    return this.records.get(slaId);
  }

  getClaimSLAs(claimId: string): SLARecord[] {
    return [...this.records.values()].filter((r) => r.claimId === claimId);
  }

  generatePerformanceReport(
    periodStartAt?: string,
    periodEndAt?: string
  ): SLAPerformanceReport {
    const now = new Date().toISOString();
    const start = periodStartAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = periodEndAt ?? now;

    const inPeriod = [...this.records.values()].filter(
      (r) => r.startedAt >= start && r.startedAt <= end
    );

    const completed = inPeriod.filter((r) => r.status === "COMPLETED");
    const breached = inPeriod.filter((r) => r.status === "BREACHED");
    const inProgress = inPeriod.filter((r) => r.status === "ON_TRACK" || r.status === "AT_RISK");
    const waived = inPeriod.filter((r) => r.status === "WAIVED");

    const avgCompletion = completed.length > 0
      ? completed.reduce((s, r) => s + r.elapsedMinutes, 0) / completed.length
      : 0;
    const avgBreach = breached.length > 0
      ? breached.reduce((s, r) => s + r.breachMinutes, 0) / breached.length
      : 0;

    // By operation type
    const byOperationType = {} as Record<SLAOperationType, SLATypeStats>;
    for (const opType of Object.keys(SLA_DEFINITIONS) as SLAOperationType[]) {
      const ops = inPeriod.filter((r) => r.operationType === opType);
      const onTime = ops.filter((r) => r.status === "COMPLETED").length;
      const opBreached = ops.filter((r) => r.status === "BREACHED").length;
      byOperationType[opType] = {
        total: ops.length,
        onTime,
        breached: opBreached,
        complianceRate: ops.length > 0 ? onTime / ops.length : 1,
        averageMinutes: ops.length > 0
          ? ops.reduce((s, r) => s + r.elapsedMinutes, 0) / ops.length
          : 0,
      };
    }

    // By tier
    const byTier = {} as Record<SLATier, SLATierStats>;
    for (const tier of ["STANDARD", "PRIORITY", "CRITICAL", "REGULATORY"] as SLATier[]) {
      const tierOps = inPeriod.filter((r) => r.tier === tier);
      const onTime = tierOps.filter((r) => r.status === "COMPLETED").length;
      const tierBreached = tierOps.filter((r) => r.status === "BREACHED").length;
      byTier[tier] = {
        total: tierOps.length,
        onTime,
        breached: tierBreached,
        complianceRate: tierOps.length > 0 ? onTime / tierOps.length : 1,
      };
    }

    // Top breaching claims
    const topBreaching: SLABreachSummary[] = breached
      .sort((a, b) => b.breachMinutes - a.breachMinutes)
      .slice(0, 10)
      .map((r) => ({
        claimId: r.claimId,
        operationType: r.operationType,
        breachMinutes: r.breachMinutes,
        tier: r.tier,
      }));

    return {
      generatedAt: now,
      periodStartAt: start,
      periodEndAt: end,
      totalOperations: inPeriod.length,
      completedOnTime: completed.length,
      completedLate: breached.filter((r) => r.completedAt).length,
      inProgress: inProgress.length,
      breached: breached.length,
      waived: waived.length,
      overallComplianceRate: inPeriod.length > 0
        ? completed.length / inPeriod.length
        : 1,
      averageCompletionTimeMinutes: avgCompletion,
      averageBreachMinutes: avgBreach,
      byOperationType,
      byTier,
      topBreachingClaims: topBreaching,
    };
  }

  clear(): void {
    this.records.clear();
    this.counter = 0;
  }
}

export const trustSLAManager = new TrustSLAManagerImpl();
