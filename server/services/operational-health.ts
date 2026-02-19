// @ts-nocheck
/**
 * Operational Readiness Health Monitoring Service
 * 
 * Monitors system health across governance, data integrity, performance, and AI stability.
 * Provides traffic-light indicators and overall health index (0-100).
 * 
 * ACCESS CONTROL: Super-admin only
 */

import { getDb } from "../db";
import { claims, auditTrail, aiAssessments, assessorEvaluations, panelBeaterQuotes } from "../../drizzle/schema";
import { eq, and, gte, lte, sql, count, avg, isNull, isNotNull } from "drizzle-orm";

/**
 * Traffic light status
 */
export type HealthStatus = "green" | "amber" | "red";

/**
 * Health thresholds for traffic-light system
 */
const HEALTH_THRESHOLDS = {
  green: 80,  // 80-100: Green
  amber: 50,  // 50-79: Amber
  // 0-49: Red
};

/**
 * Component weights for overall health index
 */
const COMPONENT_WEIGHTS = {
  governance: 0.30,      // 30%
  dataIntegrity: 0.25,   // 25%
  performance: 0.20,     // 20%
  aiStability: 0.25,     // 25%
};

/**
 * Governance Health Metrics
 */
export interface GovernanceHealth {
  workflowEngineComplianceRate: number;  // % of transitions via WorkflowEngine
  segregationViolationAttempts: number;
  auditLoggingCoverage: number;          // % of actions logged
  score: number;                         // 0-100
  status: HealthStatus;
}

/**
 * Data Integrity Metrics
 */
export interface DataIntegrityHealth {
  claimsMissingDocuments: number;
  incompleteWorkflowStates: number;
  orphanedRecords: {
    claimsWithoutAssessments: number;
    quotesWithoutClaims: number;
    assessmentsWithoutClaims: number;
  };
  score: number;  // 0-100
  status: HealthStatus;
}

/**
 * Performance Metrics
 */
export interface PerformanceHealth {
  avgDashboardLoadTime: number;      // milliseconds
  avgClaimProcessingTime: number;    // hours
  avgRowsScannedPerRequest: number;
  score: number;  // 0-100
  status: HealthStatus;
}

/**
 * AI Stability Metrics
 */
export interface AIStabilityHealth {
  avgConfidenceScore: number;        // 0-100
  escalationRate: number;            // % of AI assessments escalated to human
  aiVsAssessorVariance: {
    avgVariancePercent: number;
    distribution: {
      low: number;      // < 10% variance
      medium: number;   // 10-20% variance
      high: number;     // > 20% variance
    };
  };
  score: number;  // 0-100
  status: HealthStatus;
}

/**
 * Overall Operational Health
 */
export interface OperationalHealth {
  timestamp: Date;
  overallScore: number;  // 0-100 weighted average
  overallStatus: HealthStatus;
  
  governance: GovernanceHealth;
  dataIntegrity: DataIntegrityHealth;
  performance: PerformanceHealth;
  aiStability: AIStabilityHealth;
}

/**
 * Determine health status based on score
 */
function getHealthStatus(score: number): HealthStatus {
  if (score >= HEALTH_THRESHOLDS.green) return "green";
  if (score >= HEALTH_THRESHOLDS.amber) return "amber";
  return "red";
}

/**
 * Calculate Governance Health
 */
async function calculateGovernanceHealth(): Promise<GovernanceHealth> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Workflow Engine Compliance Rate
  // Count transitions logged in audit trail vs total state changes
  const totalStateChanges = await db
    .select({ count: count() })
    .from(auditTrail)
    .where(eq(auditTrail.action, "status_changed"));
  
  const workflowEngineTransitions = await db
    .select({ count: count() })
    .from(auditTrail)
    .where(
      and(
        eq(auditTrail.action, "status_changed"),
        sql`${auditTrail.newValue} LIKE '%workflowEngine%'`
      )
    );
  
  const workflowEngineComplianceRate =
    totalStateChanges[0].count > 0
      ? (workflowEngineTransitions[0].count / totalStateChanges[0].count) * 100
      : 100; // Default to 100 if no data
  
  // 2. Segregation Violation Attempts
  // Count audit entries where action was blocked due to segregation
  const segregationViolations = await db
    .select({ count: count() })
    .from(auditTrail)
    .where(sql`${auditTrail.changeDescription} LIKE '%segregation%violation%'`);
  
  const segregationViolationAttempts = segregationViolations[0].count;
  
  // 3. Audit Logging Coverage
  // Estimate coverage by checking if critical actions have audit entries
  const totalClaims = await db.select({ count: count() }).from(claims);
  const claimsWithAudit = await db
    .select({ count: sql`COUNT(DISTINCT ${auditTrail.claimId})` })
    .from(auditTrail);
  
  const auditLoggingCoverage =
    totalClaims[0].count > 0
      ? (Number(claimsWithAudit[0].count) / totalClaims[0].count) * 100
      : 100;
  
  // Calculate governance score
  // - Workflow compliance: 40%
  // - Low violation attempts: 30% (score decreases with more violations)
  // - Audit coverage: 30%
  const violationPenalty = Math.min(segregationViolationAttempts * 2, 30); // Max 30 point penalty
  const score = Math.max(
    0,
    workflowEngineComplianceRate * 0.4 +
      (30 - violationPenalty) +
      auditLoggingCoverage * 0.3
  );
  
  return {
    workflowEngineComplianceRate,
    segregationViolationAttempts,
    auditLoggingCoverage,
    score,
    status: getHealthStatus(score),
  };
}

/**
 * Calculate Data Integrity Health
 */
async function calculateDataIntegrityHealth(): Promise<DataIntegrityHealth> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Claims Missing Required Documents
  // Check for claims without police reports or photos
  const claimsMissingDocs = await db
    .select({ count: count() })
    .from(claims)
    .where(
      sql`${claims.photoUrls} IS NULL OR ${claims.photoUrls} = '[]' OR ${claims.photoUrls} = ''`
    );
  
  const claimsMissingDocuments = claimsMissingDocs[0].count;
  
  // 2. Incomplete Workflow States
  // Claims that are stuck in intermediate states for too long
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const incompleteClaims = await db
    .select({ count: count() })
    .from(claims)
    .where(
      and(
        sql`${claims.status} NOT IN ('closed', 'rejected', 'settled')`,
        sql`${claims.updatedAt} < ${sevenDaysAgo}`
      )
    );
  
  const incompleteWorkflowStates = incompleteClaims[0].count;
  
  // 3. Orphaned Records
  // Claims without AI assessments
  const claimsWithoutAssessments = await db
    .select({ count: count() })
    .from(claims)
    .leftJoin(aiAssessments, eq(claims.id, aiAssessments.claimId))
    .where(isNull(aiAssessments.id));
  
  // Quotes without valid claims
  const quotesWithoutClaims = await db
    .select({ count: count() })
    .from(panelBeaterQuotes)
    .leftJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
    .where(isNull(claims.id));
  
  // Assessments without valid claims
  const assessmentsWithoutClaims = await db
    .select({ count: count() })
    .from(assessorEvaluations)
    .leftJoin(claims, eq(assessorEvaluations.claimId, claims.id))
    .where(isNull(claims.id));
  
  const orphanedRecords = {
    claimsWithoutAssessments: claimsWithoutAssessments[0].count,
    quotesWithoutClaims: quotesWithoutClaims[0].count,
    assessmentsWithoutClaims: assessmentsWithoutClaims[0].count,
  };
  
  // Calculate data integrity score
  // Lower counts = higher score
  const totalClaims = await db.select({ count: count() }).from(claims);
  const totalClaimsCount = totalClaims[0].count || 1;
  
  const missingDocsRate = (claimsMissingDocuments / totalClaimsCount) * 100;
  const incompleteRate = (incompleteWorkflowStates / totalClaimsCount) * 100;
  const orphanedRate =
    ((orphanedRecords.claimsWithoutAssessments +
      orphanedRecords.quotesWithoutClaims +
      orphanedRecords.assessmentsWithoutClaims) /
      totalClaimsCount) *
    100;
  
  // Score: 100 - (weighted penalties)
  const score = Math.max(
    0,
    100 - (missingDocsRate * 0.4 + incompleteRate * 0.3 + orphanedRate * 0.3)
  );
  
  return {
    claimsMissingDocuments,
    incompleteWorkflowStates,
    orphanedRecords,
    score,
    status: getHealthStatus(score),
  };
}

/**
 * Calculate Performance Health
 */
async function calculatePerformanceHealth(): Promise<PerformanceHealth> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Average Dashboard Load Time
  // Measure query execution time for typical dashboard query
  const startTime = Date.now();
  await db.select().from(claims).limit(100);
  const queryTime = Date.now() - startTime;
  const avgDashboardLoadTime = queryTime;
  
  // 2. Average Claim Processing Time
  // Calculate time from claim creation to closure
  const processingTimes = await db
    .select({
      claimId: claims.id,
      createdAt: claims.createdAt,
      closedAt: sql`(SELECT ${auditTrail.createdAt} FROM ${auditTrail} WHERE ${auditTrail.claimId} = ${claims.id} AND ${auditTrail.action} = 'claim_closed' ORDER BY ${auditTrail.createdAt} DESC LIMIT 1)`,
    })
    .from(claims)
    .where(sql`${claims.status} = 'closed'`)
    .limit(100);
  
  let totalProcessingTime = 0;
  let validCount = 0;
  
  for (const record of processingTimes) {
    if (record.closedAt) {
      const processingHours =
        (new Date(record.closedAt).getTime() - record.createdAt.getTime()) /
        (1000 * 60 * 60);
      totalProcessingTime += processingHours;
      validCount++;
    }
  }
  
  const avgClaimProcessingTime = validCount > 0 ? totalProcessingTime / validCount : 0;
  
  // 3. Average Rows Scanned Per Request
  // Estimate based on table sizes and typical queries
  const tableStats = await db
    .select({ count: count() })
    .from(claims);
  
  const avgRowsScannedPerRequest = tableStats[0].count / 10; // Rough estimate
  
  // Calculate performance score
  // - Fast load times (< 500ms): 40%
  // - Fast processing (< 48h): 40%
  // - Efficient queries (< 1000 rows): 20%
  const loadTimeScore = Math.max(0, 100 - (avgDashboardLoadTime / 5)); // 500ms = 0 penalty
  const processingTimeScore = Math.max(0, 100 - (avgClaimProcessingTime / 0.48)); // 48h = 0 penalty
  const queryEfficiencyScore = Math.max(0, 100 - (avgRowsScannedPerRequest / 10)); // 1000 rows = 0 penalty
  
  const score =
    loadTimeScore * 0.4 + processingTimeScore * 0.4 + queryEfficiencyScore * 0.2;
  
  return {
    avgDashboardLoadTime,
    avgClaimProcessingTime,
    avgRowsScannedPerRequest,
    score,
    status: getHealthStatus(score),
  };
}

/**
 * Calculate AI Stability Health
 */
async function calculateAIStabilityHealth(): Promise<AIStabilityHealth> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Average Confidence Score
  // Get confidence scores from AI assessments
  const confidenceScores = await db
    .select({
      confidence: sql`CAST(JSON_EXTRACT(${auditTrail.newValue}, '$.confidenceScore') AS DECIMAL(5,2))`,
    })
    .from(auditTrail)
    .where(
      and(
        eq(auditTrail.action, "ai_assessment_completed"),
        isNotNull(auditTrail.newValue)
      )
    )
    .limit(1000);
  
  let totalConfidence = 0;
  let validConfidenceCount = 0;
  
  for (const record of confidenceScores) {
    if (record.confidence !== null) {
      totalConfidence += Number(record.confidence);
      validConfidenceCount++;
    }
  }
  
  const avgConfidenceScore =
    validConfidenceCount > 0 ? totalConfidence / validConfidenceCount : 0;
  
  // 2. Escalation Rate
  // % of AI assessments that were escalated to human review
  const totalAiAssessments = await db
    .select({ count: count() })
    .from(aiAssessments);
  
  const escalatedAssessments = await db
    .select({ count: count() })
    .from(auditTrail)
    .where(
      and(
        eq(auditTrail.action, "escalated_to_human"),
        isNotNull(auditTrail.claimId)
      )
    );
  
  const escalationRate =
    totalAiAssessments[0].count > 0
      ? (escalatedAssessments[0].count / totalAiAssessments[0].count) * 100
      : 0;
  
  // 3. AI vs Assessor Variance Distribution
  // Compare AI estimated cost vs assessor evaluated cost
  const variances = await db
    .select({
      aiCost: aiAssessments.estimatedCost,
      assessorCost: assessorEvaluations.estimatedRepairCost,
    })
    .from(aiAssessments)
    .innerJoin(
      assessorEvaluations,
      eq(aiAssessments.claimId, assessorEvaluations.claimId)
    )
    .where(
      and(
        isNotNull(aiAssessments.estimatedCost),
        isNotNull(assessorEvaluations.estimatedRepairCost)
      )
    )
    .limit(1000);
  
  let totalVariance = 0;
  let lowVarianceCount = 0;
  let mediumVarianceCount = 0;
  let highVarianceCount = 0;
  
  for (const record of variances) {
    if (record.aiCost && record.assessorCost) {
      const variance =
        Math.abs(Number(record.aiCost) - Number(record.assessorCost)) /
        Number(record.assessorCost);
      const variancePercent = variance * 100;
      
      totalVariance += variancePercent;
      
      if (variancePercent < 10) {
        lowVarianceCount++;
      } else if (variancePercent < 20) {
        mediumVarianceCount++;
      } else {
        highVarianceCount++;
      }
    }
  }
  
  const avgVariancePercent = variances.length > 0 ? totalVariance / variances.length : 0;
  
  const aiVsAssessorVariance = {
    avgVariancePercent,
    distribution: {
      low: lowVarianceCount,
      medium: mediumVarianceCount,
      high: highVarianceCount,
    },
  };
  
  // Calculate AI stability score
  // - High confidence (> 80): 40%
  // - Low escalation rate (< 20%): 30%
  // - Low variance (< 15%): 30%
  const confidenceScore = (avgConfidenceScore / 80) * 40;
  const escalationScore = Math.max(0, 30 - escalationRate * 1.5);
  const varianceScore = Math.max(0, 30 - avgVariancePercent * 2);
  
  const score = confidenceScore + escalationScore + varianceScore;
  
  return {
    avgConfidenceScore,
    escalationRate,
    aiVsAssessorVariance,
    score,
    status: getHealthStatus(score),
  };
}

/**
 * Get overall operational health
 */
export async function getOperationalHealth(): Promise<OperationalHealth> {
  // Calculate all health components in parallel
  const [governance, dataIntegrity, performance, aiStability] = await Promise.all([
    calculateGovernanceHealth(),
    calculateDataIntegrityHealth(),
    calculatePerformanceHealth(),
    calculateAIStabilityHealth(),
  ]);
  
  // Calculate weighted overall score
  const overallScore =
    governance.score * COMPONENT_WEIGHTS.governance +
    dataIntegrity.score * COMPONENT_WEIGHTS.dataIntegrity +
    performance.score * COMPONENT_WEIGHTS.performance +
    aiStability.score * COMPONENT_WEIGHTS.aiStability;
  
  return {
    timestamp: new Date(),
    overallScore,
    overallStatus: getHealthStatus(overallScore),
    governance,
    dataIntegrity,
    performance,
    aiStability,
  };
}
