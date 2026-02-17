/**
 * Insight calculation utilities for Executive Dashboard
 * All insights are deterministic and based on KPI data trends
 */

interface KPIData {
  totalClaims?: number;
  avgProcessingHours?: number;
  fastTrackPercentage?: number;
  fraudRiskAmount?: number;
  highRiskClaimsCount?: number;
  totalExecutiveOverrides?: number;
  segregationViolations?: number;
  roleChangesLast30Days?: number;
  avgConfidenceScore?: number;
  slaComplianceRate?: number;
}

export function calculateOperationalInsight(kpis: KPIData | undefined): string {
  if (!kpis) return "Loading operational metrics...";
  
  const processingTime = kpis.avgProcessingHours || 0;
  const fastTrackRate = kpis.fastTrackPercentage || 0;
  
  if (processingTime < 24) {
    return `Processing time at ${processingTime}h - workflow optimization delivering strong results`;
  } else if (processingTime > 72) {
    return `Processing time at ${processingTime}h - review resource allocation and bottlenecks`;
  } else if (fastTrackRate > 60) {
    return `${fastTrackRate}% fast-track rate - AI automation performing effectively`;
  }
  
  return "Operational metrics tracking within normal range";
}

export function calculateFinancialInsight(kpis: KPIData | undefined, financials: any): string {
  if (!kpis || !financials) return "Loading financial metrics...";
  
  const highValueClaims = kpis.highRiskClaimsCount || 0;
  
  if (highValueClaims > 10) {
    return `${highValueClaims} high-value claims require executive review for cost optimization`;
  }
  
  return "Financial performance tracking within targets";
}

export function calculateFraudInsight(kpis: KPIData | undefined): string {
  if (!kpis) return "Loading fraud metrics...";
  
  const fraudRisk = kpis.fraudRiskAmount || 0;
  const highRiskCount = kpis.highRiskClaimsCount || 0;
  
  if (fraudRisk > 500000) {
    return `Fraud risk exposure at $${(fraudRisk / 1000).toFixed(0)}K - ${highRiskCount} high-risk claims flagged`;
  } else if (highRiskCount > 15) {
    return `${highRiskCount} high-risk claims detected - immediate review recommended`;
  } else if (fraudRisk < 100000) {
    return "Fraud risk exposure reduced - detection accuracy improving";
  }
  
  return "Fraud risk exposure within acceptable limits";
}

export function calculateGovernanceInsight(kpis: KPIData | undefined): string {
  if (!kpis) return "Loading governance metrics...";
  
  const overrides = kpis.totalExecutiveOverrides || 0;
  const violations = kpis.segregationViolations || 0;
  const totalClaims = kpis.totalClaims || 1;
  const overrideRate = (overrides / totalClaims) * 100;
  
  if (overrideRate > 15) {
    return `Override rate at ${overrideRate.toFixed(1)}% - review override justifications and approval thresholds`;
  } else if (violations > 0) {
    return `${violations} segregation violation attempts blocked - system controls effective`;
  } else if (overrides > 0) {
    return `${overrides} executive overrides (${overrideRate.toFixed(1)}%) - governance controls operating normally`;
  }
  
  return "Governance controls operating within policy limits";
}

export function calculateAIInsight(kpis: KPIData | undefined): string {
  if (!kpis) return "Loading AI performance metrics...";
  
  const confidenceScore = kpis.avgConfidenceScore || 0;
  const fastTrackRate = kpis.fastTrackPercentage || 0;
  
  if (confidenceScore > 70) {
    return `AI confidence at ${confidenceScore}% - high accuracy enabling ${fastTrackRate}% fast-track rate`;
  } else if (confidenceScore < 40) {
    return `AI confidence at ${confidenceScore}% - model retraining recommended to improve accuracy`;
  } else if (fastTrackRate > 50) {
    return `${fastTrackRate}% of claims fast-tracked - AI automation delivering efficiency gains`;
  }
  
  return "AI performance metrics within expected range";
}

export function calculateWorkflowInsight(kpis: KPIData | undefined, bottlenecks: any): string {
  if (!kpis) return "Loading workflow metrics...";
  
  const slaCompliance = kpis.slaComplianceRate || 100;
  const bottleneckStage = bottlenecks?.[0]?.state || "None";
  
  if (slaCompliance < 80) {
    return `SLA compliance at ${slaCompliance}% - bottleneck detected in ${bottleneckStage} stage`;
  } else if (bottleneckStage !== "None" && bottlenecks?.[0]?.avgTime > 48) {
    return `Primary bottleneck: ${bottleneckStage} (${bottlenecks[0].avgTime}h avg) - consider resource reallocation`;
  } else if (slaCompliance > 95) {
    return `SLA compliance at ${slaCompliance}% - workflow processing efficiently`;
  }
  
  return "Workflow processing efficiently - no critical bottlenecks detected";
}
