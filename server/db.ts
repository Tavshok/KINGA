// @ts-nocheck
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";
import { 
  InsertUser, 
  users,
  claims,
  InsertClaim,
  panelBeaters,
  InsertPanelBeater,
  aiAssessments,
  InsertAiAssessment,
  assessorEvaluations,
  InsertAssessorEvaluation,
  panelBeaterQuotes,
  InsertPanelBeaterQuote,
  appointments,
  InsertAppointment,
  auditTrail,
  InsertAuditTrailEntry,
  notifications,
  InsertNotification,
  fraudIndicators,
  claimantHistory,
  vehicleHistory,
  entityRelationships,
  fraudAlerts,
  fraudRules,
  quoteLineItems,
  InsertQuoteLineItem,
  thirdPartyVehicles,
  InsertThirdPartyVehicle,
  vehicleMarketValuations,
  InsertVehicleMarketValuation,
  policeReports,
  InsertPoliceReport,
  preAccidentDamage,
  InsertPreAccidentDamage,
  vehicleConditionAssessment,
  InsertVehicleConditionAssessment,
  approvalWorkflow,
  InsertApprovalWorkflow,
  assessors,
  assessorInsurerRelationships,
  claimEvents,
  InsertClaimEvent,
  ingestionDocuments,
  decisionSnapshots,
  DecisionSnapshot
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create the drizzle instance with a proper connection pool.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: 5,
        waitForConnections: true,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 30000,  // Send keepalive after 30s idle
        connectTimeout: 30000,
        multipleStatements: false,
        // TiDB Cloud drops idle connections after ~5 minutes.
        // Set idleTimeout to 4 minutes so the pool releases connections before TiDB drops them.
        idleTimeout: 240000,
      });
      // Reset pool on fatal connection errors so next getDb() call creates a fresh pool
      (_pool as any).on('error', (err: Error) => {
        if ((err as any).code === 'ECONNRESET' || (err as any).code === 'PROTOCOL_CONNECTION_LOST') {
          console.warn('[Database] Pool connection lost, will reinitialise on next query:', err.message);
          _db = null;
          _pool = null;
        }
      });
      _db = drizzle(_pool, { schema, mode: "default" });
      console.log("[Database] Connection pool initialized");
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

// ============================================================================
// USER OPERATIONS
// ============================================================================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUsersByRole(role: typeof users.$inferSelect.role) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(users).where(eq(users.role, role));
}

// ============================================================================
// PANEL BEATER OPERATIONS
// ============================================================================

export async function getAllApprovedPanelBeaters() {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(panelBeaters).where(eq(panelBeaters.approved, 1));
}

export async function getPanelBeaterById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaters).where(eq(panelBeaters.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPanelBeater(data: InsertPanelBeater) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaters).values(data);
  return result;
}

// ============================================================================
// CLAIM OPERATIONS
// ============================================================================

export async function createClaim(data: InsertClaim) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(claims).values(data);
  return result;
}

export async function getClaimById(id: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId 
    ? and(eq(claims.id, id), eq(claims.tenantId, tenantId))
    : eq(claims.id, id);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimByNumber(claimNumber: string, tenantId?: string) {
  const db = await getDb();
  if (!db) return undefined;

  const conditions = tenantId
    ? and(eq(claims.claimNumber, claimNumber), eq(claims.tenantId, tenantId))
    : eq(claims.claimNumber, claimNumber);
  
  const result = await db.select().from(claims).where(conditions).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClaimsByClaimant(claimantId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.claimantId, claimantId), eq(claims.tenantId, tenantId))
    : eq(claims.claimantId, claimantId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsByAssessor(assessorId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  const conditions = tenantId
    ? and(eq(claims.assignedAssessorId, assessorId), eq(claims.tenantId, tenantId))
    : eq(claims.assignedAssessorId, assessorId);
  
  return await db.select().from(claims).where(conditions).orderBy(desc(claims.createdAt));
}

export async function getClaimsForPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  // Get claims where this panel beater was selected by the claimant
  const query = tenantId
    ? db.select().from(claims).where(eq(claims.tenantId, tenantId)).orderBy(desc(claims.createdAt))
    : db.select().from(claims).orderBy(desc(claims.createdAt));
  
  const allClaims = await query;
  
  return allClaims.filter(claim => {
    if (!claim.selectedPanelBeaterIds) return false;
    try {
      const selectedIds = JSON.parse(claim.selectedPanelBeaterIds);
      return selectedIds.includes(panelBeaterId);
    } catch {
      return false;
    }
  });
}

/**
 * @deprecated Use WorkflowEngine.transition() instead for governance-compliant state changes
 * This function is kept for backward compatibility but will route through WorkflowEngine
 */
export async function updateClaimStatus(
  claimId: number,
  status: typeof claims.$inferSelect.status,
  userId: number,
  userRole: string,
  tenantId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // All state transitions MUST go through WorkflowEngine for governance
  const { transition } = await import("./workflow-engine");
  const { statusToWorkflowState } = await import("./workflow-migration");
  
  const toState = statusToWorkflowState(status as any);
  
  // Detect and heal workflowState/status inconsistency:
  // If the DB workflowState doesn't match what the current status implies,
  // the claim is in a stale/inconsistent state from a previous failed run.
  // In that case, derive fromState from the status field (source of truth for legacy claims).
  const statusImpliedState = statusToWorkflowState(claim.status as any);
  const dbWorkflowState = claim.workflowState;
  
  let fromState: string;
  if (dbWorkflowState && dbWorkflowState === toState) {
    // Self-transition detected — use status-implied state to avoid invalid loop
    console.warn(`[Workflow] Self-transition detected for claim ${claimId}: ${dbWorkflowState} → ${toState}. Using status-implied state: ${statusImpliedState}`);
    fromState = statusImpliedState;
  } else {
    fromState = dbWorkflowState || statusImpliedState;
  }
  
  await transition({
    claimId,
    fromState: fromState as any,
    toState: toState as any,
    userId,
    userRole: userRole as any,
  });
}

export async function assignClaimToAssessor(claimId: number, assessorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current claim status for validation
  const [claim] = await db.select().from(claims).where(eq(claims.id, claimId));
  if (!claim) throw new Error(`Claim ${claimId} not found`);
  
  // Validate state transition to assessment_pending
  const { validateStateTransition } = await import("./workflow-validator");
  validateStateTransition(claim.status as any, "assessment_pending");

  await db.update(claims).set({ 
    assignedAssessorId: assessorId,
    status: "assessment_pending",
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

export async function updateClaimPolicyVerification(claimId: number, verified: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(claims).set({ 
    policyVerified: verified ? 1 : 0,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, claimId));
}

/**
 * Trigger AI Assessment — Pipeline v2 (10-stage deterministic pipeline)
 *
 * Runs the structured 10-stage pipeline:
 *   1. Document Ingestion
 *   2. OCR & Text Extraction
 *   3. Structured Data Extraction
 *   4. Data Validation
 *   5. Claim Data Assembly (builds ClaimRecord)
 *   6. Damage Analysis Engine
 *   7. Physics Analysis Engine
 *   8. Fraud Analysis Engine
 *   9. Cost Optimisation Engine
 *  10. Report Generation
 */
export async function triggerAiAssessment(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { runPipelineV2 } = await import("./pipeline-v2/orchestrator");

  // Get claim details including damage photos
  const claim = await getClaimById(claimId);
  if (!claim) throw new Error("Claim not found");

  // Mark assessment as triggered and transition to 'parsing'
  await db.update(claims).set({
    aiAssessmentTriggered: 1,
    documentProcessingStatus: "parsing",
    updatedAt: new Date().toISOString(),
  }).where(eq(claims.id, claimId));
  console.log(`[AI Assessment] Claim ${claimId} — Pipeline v2 starting.`);

  // -----------------------------------------------------------------------
  // TOP-LEVEL FAILURE GUARD
  // -----------------------------------------------------------------------
  try {

  // Resolve PDF URL and damage photos
  let pdfUrl: string | null = null;
  let damagePhotos: string[] = [];

  if (claim.sourceDocumentId) {
    // PDF-sourced claim: look up the source document URL
    try {
      const [sourceDoc] = await db.select().from(ingestionDocuments)
        .where(eq(ingestionDocuments.id, claim.sourceDocumentId)).limit(1);
      if (sourceDoc && sourceDoc.s3Url) {
        pdfUrl = sourceDoc.s3Url;
        console.log(`[AI Assessment] Claim ${claimId}: PDF-sourced claim. Will send PDF directly to LLM: ${sourceDoc.originalFilename}`);
      } else {
        console.warn(`[AI Assessment] Claim ${claimId}: sourceDocumentId=${claim.sourceDocumentId} but no S3 URL found.`);
      }
    } catch (docErr: any) {
      console.warn(`[AI Assessment] Claim ${claimId}: Failed to look up source document: ${docErr.message}`);
    }
  }

  // If no PDF URL, fall back to user-uploaded damage photos
  if (!pdfUrl) {
    damagePhotos = claim.damagePhotos ? JSON.parse(claim.damagePhotos) : [];
  }

  // If we have neither a PDF nor photos, create a placeholder and return
  if (!pdfUrl && damagePhotos.length === 0) {
    console.log(`[AI Assessment] Claim ${claimId}: No PDF and no damage photos. Creating placeholder.`);
    await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch(() => {});
    await db.insert(aiAssessments).values({
      claimId,
      tenantId: claim.tenantId ?? null,
      damageDescription: "Assessment pending - No damage photos or documents uploaded yet.",
      damagedComponentsJson: JSON.stringify([]),
      estimatedCost: 0,
      fraudIndicators: JSON.stringify(["No photos or documents available for analysis"]),
      fraudRiskLevel: "low",
      totalLossIndicated: 0,
      structuralDamageSeverity: "none"
    });
    await db.update(claims).set({ 
      aiAssessmentCompleted: 1,
      status: "assessment_complete",
      documentProcessingStatus: "extracted",
      updatedAt: new Date().toISOString() 
    }).where(eq(claims.id, claimId));
    return { success: true, message: "Placeholder assessment created. Please upload damage photos or documents for full analysis." };
  }

  // ── PIPELINE V2 ──────────────────────────────────────────────────────
  // Build pipeline context and run the 10-stage orchestrator.
  // The old monolithic LLM call + inline stages are replaced by this.
  // ────────────────────────────────────────────────────────────────────
  const pipelineCtx = {
    claimId,
    tenantId: claim.tenantId ? Number(claim.tenantId) : null,
    assessmentId: 0, // Will be set after insert
    claim: claim as Record<string, any>,
    pdfUrl,
    damagePhotoUrls: damagePhotos,
    db,
    log: (stage: string, msg: string) => console.log(`[${stage}] Claim ${claimId}: ${msg}`),
  };

  const result = await runPipelineV2(pipelineCtx);

  // ── PERSIST RESULTS TO DATABASE ────────────────────────────────────
  const { claimRecord, report, damageAnalysis, physicsAnalysis, fraudAnalysis, costAnalysis, turnaroundAnalysis, summary, causalChain, evidenceBundle, realismBundle, benchmarkBundle, consensusResult, causalVerdict, validatedOutcome, caseSignature } = result;

  // Map fraud risk level to DB enum
  const fraudLevelMap: Record<string, 'low' | 'medium' | 'high' | 'critical' | 'elevated'> = {
    minimal: 'low', low: 'low', medium: 'medium', high: 'high', critical: 'elevated', elevated: 'elevated',
  };
  const dbFraudLevel = fraudAnalysis ? (fraudLevelMap[fraudAnalysis.fraudRiskLevel] || 'low') : 'low';

  // Map structural severity to DB enum
  const severityMap: Record<string, 'none' | 'minor' | 'moderate' | 'severe' | 'catastrophic'> = {
    none: 'none', cosmetic: 'minor', minor: 'minor', moderate: 'moderate', severe: 'severe', catastrophic: 'catastrophic',
  };
  const dbStructuralSeverity = physicsAnalysis
    ? (severityMap[physicsAnalysis.accidentSeverity] || 'moderate')
    : 'none';

  // Build damaged components JSON
  const damagedComponentsJson = damageAnalysis
    ? JSON.stringify(damageAnalysis.damagedParts.map(p => ({
        name: p.name,
        location: p.location,
        damageType: p.damageType,
        severity: p.severity,
        visible: p.visible,
      })))
    : '[]';

  // Build physics analysis JSON
  const physicsJson = physicsAnalysis ? JSON.stringify({
    impactForceKn: physicsAnalysis.impactForceKn,
    impactVector: physicsAnalysis.impactVector,
    energyDistribution: physicsAnalysis.energyDistribution,
    estimatedSpeedKmh: physicsAnalysis.estimatedSpeedKmh,
    deltaVKmh: physicsAnalysis.deltaVKmh,
    decelerationG: physicsAnalysis.decelerationG,
    accidentSeverity: physicsAnalysis.accidentSeverity,
    reconstructionSummary: physicsAnalysis.accidentReconstructionSummary,
    damageConsistencyScore: physicsAnalysis.damageConsistencyScore,
    latentDamageProbability: physicsAnalysis.latentDamageProbability,
    physicsExecuted: physicsAnalysis.physicsExecuted,
    severityConsensus: (physicsAnalysis as any).severityConsensus ?? null,
    damagePatternValidation: (physicsAnalysis as any).damagePatternValidation ?? null,
  }) : null;

  // Build fraud indicators JSON
  const fraudIndicatorsJson = fraudAnalysis
    ? JSON.stringify(fraudAnalysis.indicators.map(i => i.description))
    : '[]';

  // Build fraud score breakdown JSON
  const fraudScoreBreakdownJson = fraudAnalysis
    ? JSON.stringify({
        overallScore: fraudAnalysis.fraudRiskScore,
        level: fraudAnalysis.fraudRiskLevel,
        indicators: fraudAnalysis.indicators,
        damageConsistency: {
          score: fraudAnalysis.damageConsistencyScore,
          notes: fraudAnalysis.damageConsistencyNotes,
        },
        // Scenario-aware fraud detection result (null if engine was skipped)
        scenarioFraudResult: fraudAnalysis.scenarioFraudResult ?? null,
        crossEngineConsistency: fraudAnalysis.crossEngineConsistency ?? null,
        confidenceAggregation: (fraudAnalysis as any).confidenceAggregation ?? null,
      })
    : null;

  // Build cost intelligence JSON
  const costIntelligenceJson = costAnalysis ? JSON.stringify({
    expectedRepairCostCents: costAnalysis.expectedRepairCostCents,
    quoteDeviationPct: costAnalysis.quoteDeviationPct,
    recommendedRange: costAnalysis.recommendedCostRange,
    savingsOpportunityCents: costAnalysis.savingsOpportunityCents,
    breakdown: costAnalysis.breakdown,
    labourRateUsdPerHour: costAnalysis.labourRateUsdPerHour,
    marketRegion: costAnalysis.marketRegion,
    currency: costAnalysis.currency,
  }) : null;
  // Build repair intelligence and parts reconciliation JSON
  const repairIntelligenceJson = costAnalysis?.repairIntelligence
    ? JSON.stringify(costAnalysis.repairIntelligence)
    : null;
  const partsReconciliationJson = costAnalysis?.partsReconciliation
    ? JSON.stringify(costAnalysis.partsReconciliation)
    : null;

  // Build hidden damages JSON from physics latent damage probabilities
  // latentDamageProbability values are already on a 0-100 scale (not 0-1)
  const hiddenDamagesJson = physicsAnalysis && physicsAnalysis.physicsExecuted
    ? JSON.stringify(Object.entries(physicsAnalysis.latentDamageProbability)
        .filter(([_, prob]) => (prob as number) > 10) // filter: > 10% (0-100 scale)
        .map(([system, prob]) => ({
          system,
          probability: prob, // already 0-100
          description: `Potential hidden damage to ${system} system (${(prob as number).toFixed(0)}% probability)`,
        })))
    : '[]';

  // Build damage description
  const damageDesc = claimRecord
    ? `${claimRecord.vehicle.make} ${claimRecord.vehicle.model} (${claimRecord.vehicle.year || 'unknown year'}). ${claimRecord.damage.description || 'No description available.'}. ${damageAnalysis ? damageAnalysis.damagedParts.length + ' damaged components identified.' : ''}`
    : 'Assessment data unavailable.';

  // Estimated cost in whole currency units
  const estimatedCost = costAnalysis ? Math.round(costAnalysis.expectedRepairCostCents / 100) : 0;
  const estimatedPartsCost = costAnalysis ? Math.round(costAnalysis.breakdown.partsCostCents / 100) : 0;
  const estimatedLaborCost = costAnalysis ? Math.round(costAnalysis.breakdown.labourCostCents / 100) : 0;

  // ── TOTAL LOSS DETECTION ─────────────────────────────────────────────────
  // Fetch the vehicle market value from the valuations table (stored in cents).
  // Standard industry threshold: repair cost ≥ 75% of market value = total loss.
  let vehicleMarketValueCents: number | null = null;
  try {
    const [valRow] = await db.select({ v: vehicleMarketValuations.estimatedMarketValue })
      .from(vehicleMarketValuations)
      .where(eq(vehicleMarketValuations.claimId, claimId))
      .limit(1);
    if (valRow?.v) vehicleMarketValueCents = Number(valRow.v);
  } catch { /* non-fatal */ }
  // Also check the claim's own vehicle_market_value field (in cents)
  if (!vehicleMarketValueCents && (claim as any).vehicleMarketValue) {
    vehicleMarketValueCents = Number((claim as any).vehicleMarketValue);
  }
  const vehicleMarketValueDollars = vehicleMarketValueCents ? vehicleMarketValueCents / 100 : null;
  const repairToValueRatio = (vehicleMarketValueDollars && vehicleMarketValueDollars > 0 && estimatedCost > 0)
    ? Math.round((estimatedCost / vehicleMarketValueDollars) * 100)
    : null;
  // Total loss: repair cost ≥ 75% of vehicle market value
  const totalLossIndicated = (repairToValueRatio !== null && repairToValueRatio >= 75) ? 1 : 0;
  if (totalLossIndicated) {
    console.log(`[AI Assessment] Claim ${claimId}: TOTAL LOSS indicated — repair $${estimatedCost} vs vehicle value $${vehicleMarketValueDollars?.toFixed(0)} (${repairToValueRatio}%)`);
  }

  // Delete any previous assessment for this claim
  await db.delete(aiAssessments).where(eq(aiAssessments.claimId, claimId)).catch(() => {});

  // Insert new assessment
  await db.insert(aiAssessments).values({
    claimId,
    tenantId: claim.tenantId ?? null,
    estimatedCost,
    damageDescription: damageDesc,
    detectedDamageTypes: damageAnalysis
      ? JSON.stringify([...new Set(damageAnalysis.damagedParts.map(p => p.damageType))])
      : '[]',
    confidenceScore: claimRecord ? claimRecord.dataQuality.completenessScore : 50,
    fraudIndicators: fraudIndicatorsJson,
    fraudRiskLevel: dbFraudLevel,
    fraudScoreBreakdownJson,
    modelVersion: 'pipeline-v2',
    processingTime: summary.totalDurationMs,
    totalLossIndicated,
    repairToValueRatio,
    structuralDamageSeverity: dbStructuralSeverity,
    damagedComponentsJson,
    physicsAnalysis: physicsJson,
    estimatedPartsCost,
    estimatedLaborCost,
    currencyCode: costAnalysis?.currency || 'USD',
    inferredHiddenDamagesJson: hiddenDamagesJson,
    costIntelligenceJson,
    repairIntelligenceJson,
    partsReconciliationJson,
    damagePhotosJson: claimRecord ? JSON.stringify(claimRecord.damage.imageUrls) : '[]',
    pipelineRunSummary: JSON.stringify({
      stages: summary.stages,
      turnaroundEstimate: turnaroundAnalysis ? {
        estimatedRepairDays: turnaroundAnalysis.estimatedRepairDays,
        bestCaseDays: turnaroundAnalysis.bestCaseDays,
        worstCaseDays: turnaroundAnalysis.worstCaseDays,
        confidence: turnaroundAnalysis.confidence,
        breakdown: turnaroundAnalysis.breakdown,
        bottlenecks: turnaroundAnalysis.bottlenecks,
      } : null,
    }),
    // Stage 35-42: Advanced analytics
    causalChainJson: causalChain ? JSON.stringify(causalChain) : null,
    evidenceBundleJson: evidenceBundle ? JSON.stringify(evidenceBundle) : null,
    realismBundleJson: realismBundle ? JSON.stringify(realismBundle) : null,
    benchmarkBundleJson: benchmarkBundle ? JSON.stringify(benchmarkBundle) : null,
    consensusResultJson: consensusResult ? JSON.stringify(consensusResult) : null,
    causalVerdictJson: causalVerdict ? JSON.stringify(causalVerdict) : null,
    validatedOutcomeJson: validatedOutcome ? JSON.stringify(validatedOutcome) : null,
    caseSignatureJson: caseSignature ? JSON.stringify(caseSignature) : null,
  });

  // Update claim status to complete + backfill vehicle info from extraction
  const finalFraudScore = fraudAnalysis ? fraudAnalysis.fraudRiskScore : 0;
  const claimUpdate: Record<string, any> = {
    aiAssessmentCompleted: 1,
    status: "assessment_complete",
    documentProcessingStatus: "extracted",
    fraudRiskScore: finalFraudScore,
    fraudFlags: fraudIndicatorsJson,
    estimatedCost,
    updatedAt: new Date().toISOString(),
  };
  // Backfill vehicle info from pipeline extraction (only if not already set)
  if (claimRecord?.vehicle) {
    const v = claimRecord.vehicle;
    if (v.make) claimUpdate.vehicleMake = v.make;
    if (v.model) claimUpdate.vehicleModel = v.model;
    if (v.year) claimUpdate.vehicleYear = Number(v.year) || null;
    if (v.registration) claimUpdate.vehicleRegistration = v.registration;
    if (v.vin) claimUpdate.vehicleVin = v.vin;
    if (v.color) claimUpdate.vehicleColor = v.color;
  }
  // Backfill incident info from pipeline extraction
  if (claimRecord?.damage) {
    const d = claimRecord.damage;
    if (d.description) claimUpdate.incidentDescription = d.description;
  }
  // incidentType lives in accidentDetails (DamageRecord has no incidentType field)
  if (claimRecord?.accidentDetails) {
    const a = claimRecord.accidentDetails;
    if (a.date) claimUpdate.incidentDate = a.date;
    if (a.incidentType && a.incidentType !== 'unknown') {
      // Map CanonicalIncidentType → DB enum
      const typeMap: Record<string, string> = {
        collision: 'collision', theft: 'theft', vandalism: 'vandalism',
        flood: 'flood', fire: 'fire', hijacking: 'hijacking',
      };
      const mapped = typeMap[a.incidentType];
      if (mapped) claimUpdate.incidentType = mapped;
    }
  }
  await db.update(claims).set(claimUpdate).where(eq(claims.id, claimId));

  console.log(`[AI Assessment] Claim ${claimId} — Pipeline v2 complete. Duration: ${summary.totalDurationMs}ms. Stages: ${JSON.stringify(summary.stages)}`);

  // END TOP-LEVEL TRY
  } catch (topLevelError) {
    // LLM call, JSON parse, or other unhandled failure
    console.error(`[AI Assessment] Fatal error for claim ${claimId}:`, topLevelError);
    try {
      const dbInner = await getDb();
      if (dbInner) {
        await dbInner.update(claims).set({
          documentProcessingStatus: "failed",
          status: "intake_pending",
          workflowState: "intake_queue",  // Reset workflow state so re-run can transition cleanly
          updatedAt: new Date().toISOString(),
        }).where(eq(claims.id, claimId));
        console.log(`[AI Assessment] Claim ${claimId} marked as failed after AI error. workflowState reset to intake_queue.`);
      }
    } catch (updateError) {
      console.error(`[AI Assessment] Could not update failure status for claim ${claimId}:`, updateError);
    }
    throw topLevelError; // Re-throw so the caller's setImmediate catch logs it
  }
}

// ============================================================================
// AI ASSESSMENT OPERATIONS
// ============================================================================

export async function createAiAssessment(data: InsertAiAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(aiAssessments).values(data);
  
  // Mark claim as AI assessment completed
  await db.update(claims).set({ 
    aiAssessmentCompleted: 1,
    updatedAt: new Date().toISOString() 
  }).where(eq(claims.id, data.claimId));
  
  return result;
}

export async function getAiAssessmentByClaimId(claimId: number, tenantId?: string) {
  const { parsePhysicsAnalysis } = await import('../shared/physics-types');
  const db = await getDb();
  if (!db) return null;

  let rawAssessment;
  if (tenantId) {
    // Join with claims to enforce tenant filtering — return the most recent assessment
    const result = await db.select({ assessment: aiAssessments })
      .from(aiAssessments)
      .innerJoin(claims, eq(aiAssessments.claimId, claims.id))
      .where(and(eq(aiAssessments.claimId, claimId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(aiAssessments.id))
      .limit(1);
    rawAssessment = result.length > 0 ? result[0].assessment : null;
  } else {
    const result = await db.select().from(aiAssessments)
      .where(eq(aiAssessments.claimId, claimId))
      .orderBy(desc(aiAssessments.id))
      .limit(1);
    rawAssessment = result.length > 0 ? result[0] : null;
  }
  
  if (!rawAssessment) return null;
  
  // Parse physicsAnalysis JSON with typed helper
  return {
    ...rawAssessment,
    physicsAnalysisParsed: parsePhysicsAnalysis(rawAssessment.physicsAnalysis),
  };
}

// ============================================================================
// ASSESSOR EVALUATION OPERATIONS
// ============================================================================

export async function createAssessorEvaluation(data: InsertAssessorEvaluation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorEvaluations).values(data);
  return result;
}

export async function getAssessorEvaluationByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return null;

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ evaluation: assessorEvaluations })
      .from(assessorEvaluations)
      .innerJoin(claims, eq(assessorEvaluations.claimId, claims.id))
      .where(and(eq(assessorEvaluations.claimId, claimId), eq(claims.tenantId, tenantId)))
      .limit(1);
    return result.length > 0 ? result[0].evaluation : null;
  } else {
    const result = await db.select().from(assessorEvaluations).where(eq(assessorEvaluations.claimId, claimId)).limit(1);
    return result.length > 0 ? result[0] : null;
  }
}

export async function updateAssessorEvaluation(id: number, data: Partial<InsertAssessorEvaluation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessorEvaluations).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(assessorEvaluations.id, id));
}

// ============================================================================
// PANEL BEATER QUOTE OPERATIONS
// ============================================================================

export async function createPanelBeaterQuote(data: InsertPanelBeaterQuote) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(panelBeaterQuotes).values(data);
  return result;
}

export async function getQuotesByClaimId(claimId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.claimId, claimId), eq(claims.tenantId, tenantId)));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.claimId, claimId));
  }
}

export async function getQuoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateQuote(id: number, data: Partial<InsertPanelBeaterQuote>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(panelBeaterQuotes).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(panelBeaterQuotes.id, id));
}

export async function getQuotesByPanelBeater(panelBeaterId: number, tenantId?: string) {
  const db = await getDb();
  if (!db) return [];

  if (tenantId) {
    // Join with claims to enforce tenant filtering
    const result = await db.select({ quote: panelBeaterQuotes })
      .from(panelBeaterQuotes)
      .innerJoin(claims, eq(panelBeaterQuotes.claimId, claims.id))
      .where(and(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId), eq(claims.tenantId, tenantId)))
      .orderBy(desc(panelBeaterQuotes.createdAt));
    return result.map(r => r.quote);
  } else {
    return await db.select().from(panelBeaterQuotes).where(eq(panelBeaterQuotes.panelBeaterId, panelBeaterId)).orderBy(desc(panelBeaterQuotes.createdAt));
  }
}

// ============================================================================
// APPOINTMENT OPERATIONS
// ============================================================================

export async function createAppointment(data: InsertAppointment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(appointments).values(data);
  return result;
}

export async function getAppointmentsByAssessor(assessorId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.assessorId, assessorId)).orderBy(desc(appointments.scheduledDate));
}

export async function getAppointmentsByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(appointments).where(eq(appointments.claimId, claimId)).orderBy(desc(appointments.scheduledDate));
}

export async function updateAppointmentStatus(id: number, status: typeof appointments.$inferSelect.status) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(appointments).set({ status, updatedAt: new Date().toISOString() }).where(eq(appointments.id, id));
}

// ============================================================================
// AUDIT TRAIL OPERATIONS
// ============================================================================

export async function createAuditEntry(data: InsertAuditTrailEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(auditTrail).values(data);
  return result;
}

export async function getAuditTrailByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.claimId, claimId)).orderBy(desc(auditTrail.createdAt));
}

export async function getAuditTrailByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(auditTrail).where(eq(auditTrail.userId, userId)).orderBy(desc(auditTrail.createdAt));
}

// ============================================================================
// NOTIFICATION OPERATIONS
// ============================================================================

/**
 * Create a new notification for a user
 * @param data - Notification data
 * @returns Created notification result
 */
export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(notifications).values(data);
  return result;
}

/**
 * Get all notifications for a specific user
 * @param userId - User ID
 * @param limit - Maximum number of notifications to return (default: 50)
 * @returns Array of notifications ordered by creation date (newest first)
 */
export async function getNotificationsByUser(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/**
 * Get unread notification count for a user
 * @param userId - User ID
 * @returns Count of unread notifications
 */
export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .select()
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));

  return result.length;
}

/**
 * Mark a notification as read
 * @param id - Notification ID
 */
export async function markNotificationAsRead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(eq(notifications.id, id));
}

/**
 * Mark all notifications as read for a user
 * @param userId - User ID
 */
export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(notifications)
    .set({ 
      isRead: 1, 
      readAt: new Date() 
    })
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.isRead, 0)
    ));
}

/**
 * Delete a notification
 * @param id - Notification ID
 */
export async function deleteNotification(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(notifications).where(eq(notifications.id, id));
}

/**
 * Delete old read notifications (older than 30 days)
 * Used for periodic cleanup
 */
export async function deleteOldNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await db
    .delete(notifications)
    .where(and(
      eq(notifications.isRead, 1)
      // Note: Would need to add date comparison here if supported
    ));
}


// ============================================================================
// QUOTE LINE ITEMS OPERATIONS
// ============================================================================

/**
 * Create quote line items for a quote
 * @param items - Array of line items to create
 */
export async function createQuoteLineItems(items: InsertQuoteLineItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(quoteLineItems).values(items);
}

/**
 * Get all line items for a quote
 * @param quoteId - Quote ID
 */
export async function getQuoteLineItemsByQuoteId(quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId))
    .orderBy(quoteLineItems.itemNumber);
}

/**
 * Update a quote line item
 * @param id - Line item ID
 * @param data - Updated data
 */
export async function updateQuoteLineItem(id: number, data: Partial<InsertQuoteLineItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(quoteLineItems)
    .set(data)
    .where(eq(quoteLineItems.id, id));
}

// ============================================================================
// THIRD PARTY VEHICLES OPERATIONS
// ============================================================================

/**
 * Create a third party vehicle record
 * @param data - Third party vehicle data
 */
export async function createThirdPartyVehicle(data: InsertThirdPartyVehicle) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(thirdPartyVehicles).values(data);
  return result.insertId;
}

/**
 * Get third party vehicle by claim ID
 * @param claimId - Claim ID
 */
export async function getThirdPartyVehicleByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [vehicle] = await db
    .select()
    .from(thirdPartyVehicles)
    .where(eq(thirdPartyVehicles.claimId, claimId))
    .limit(1);

  return vehicle || null;
}

/**
 * Update third party vehicle
 * @param id - Vehicle ID
 * @param data - Updated data
 */
export async function updateThirdPartyVehicle(id: number, data: Partial<InsertThirdPartyVehicle>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(thirdPartyVehicles)
    .set(data)
    .where(eq(thirdPartyVehicles.id, id));
}

// ============================================================================
// VEHICLE MARKET VALUATIONS OPERATIONS
// ============================================================================

/**
 * Create a vehicle market valuation
 * @param data - Valuation data
 */
export async function createVehicleMarketValuation(data: InsertVehicleMarketValuation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleMarketValuations).values(data);
  return result.insertId;
}

/**
 * Get vehicle market valuation by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleMarketValuationByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [valuation] = await db
    .select()
    .from(vehicleMarketValuations)
    .where(eq(vehicleMarketValuations.claimId, claimId))
    .orderBy(desc(vehicleMarketValuations.createdAt))
    .limit(1);

  return valuation || null;
}

/**
 * Update vehicle market valuation
 * @param id - Valuation ID
 * @param data - Updated data
 */
export async function updateVehicleMarketValuation(id: number, data: Partial<InsertVehicleMarketValuation>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleMarketValuations)
    .set(data)
    .where(eq(vehicleMarketValuations.id, id));
}

// ============================================================================
// POLICE REPORTS OPERATIONS
// ============================================================================

/**
 * Create a police report
 * @param data - Police report data
 */
export async function createPoliceReport(data: InsertPoliceReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(policeReports).values(data);
  return result.insertId;
}

/**
 * Get police report by claim ID
 * @param claimId - Claim ID
 */
export async function getPoliceReportByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [report] = await db
    .select()
    .from(policeReports)
    .where(eq(policeReports.claimId, claimId))
    .limit(1);

  return report || null;
}

/**
 * Update police report
 * @param id - Report ID
 * @param data - Updated data
 */
export async function updatePoliceReport(id: number, data: Partial<InsertPoliceReport>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(policeReports)
    .set(data)
    .where(eq(policeReports.id, id));
}

// ============================================================================
// PRE-ACCIDENT DAMAGE OPERATIONS
// ============================================================================

/**
 * Create pre-accident damage records
 * @param data - Damage data (single or array)
 */
export async function createPreAccidentDamage(data: InsertPreAccidentDamage | InsertPreAccidentDamage[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(preAccidentDamage).values(items);
}

/**
 * Get all pre-accident damage for a claim
 * @param claimId - Claim ID
 */
export async function getPreAccidentDamageByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(preAccidentDamage)
    .where(eq(preAccidentDamage.claimId, claimId));
}

// ============================================================================
// VEHICLE CONDITION ASSESSMENT OPERATIONS
// ============================================================================

/**
 * Create a vehicle condition assessment
 * @param data - Assessment data
 */
export async function createVehicleConditionAssessment(data: InsertVehicleConditionAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(vehicleConditionAssessment).values(data);
  return result.insertId;
}

/**
 * Get vehicle condition assessment by claim ID
 * @param claimId - Claim ID
 */
export async function getVehicleConditionAssessmentByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assessment] = await db
    .select()
    .from(vehicleConditionAssessment)
    .where(eq(vehicleConditionAssessment.claimId, claimId))
    .limit(1);

  return assessment || null;
}

/**
 * Update vehicle condition assessment
 * @param id - Assessment ID
 * @param data - Updated data
 */
export async function updateVehicleConditionAssessment(id: number, data: Partial<InsertVehicleConditionAssessment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(vehicleConditionAssessment)
    .set(data)
    .where(eq(vehicleConditionAssessment.id, id));
}

// ============================================================================
// APPROVAL WORKFLOW OPERATIONS
// ============================================================================

/**
 * Create approval workflow entries for a claim
 * @param data - Workflow data (single or array)
 */
export async function createApprovalWorkflow(data: InsertApprovalWorkflow | InsertApprovalWorkflow[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = Array.isArray(data) ? data : [data];
  await db.insert(approvalWorkflow).values(items);
}

/**
 * Get all approval workflow entries for a claim
 * @param claimId - Claim ID
 */
export async function getApprovalWorkflowByClaimId(claimId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return await db
    .select()
    .from(approvalWorkflow)
    .where(eq(approvalWorkflow.claimId, claimId))
    .orderBy(approvalWorkflow.levelOrder);
}

/**
 * Get pending approval for a specific level
 * @param claimId - Claim ID
 * @param level - Approval level
 */
export async function getPendingApprovalByLevel(
  claimId: number,
  level: 'assessor' | 'risk_surveyor' | 'risk_manager'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [approval] = await db
    .select()
    .from(approvalWorkflow)
    .where(and(
      eq(approvalWorkflow.claimId, claimId),
      eq(approvalWorkflow.level, level),
      eq(approvalWorkflow.status, 'pending')
    ))
    .limit(1);

  return approval || null;
}

/**
 * Update approval workflow entry
 * @param id - Workflow ID
 * @param data - Updated data
 */
export async function updateApprovalWorkflow(id: number, data: Partial<InsertApprovalWorkflow>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(approvalWorkflow)
    .set(data)
    .where(eq(approvalWorkflow.id, id));
}

// ============================================================================
// ASSESSOR OPERATIONS
// ============================================================================

export async function createAssessor(data: typeof assessors.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessors).values(data);
  return result;
}

export async function getAssessorByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAssessorByLicenseNumber(licenseNumber: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(assessors).where(eq(assessors.professionalLicenseNumber, licenseNumber)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateAssessor(id: number, data: Partial<typeof assessors.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assessors).set(data).where(eq(assessors.id, id));
}

export async function createAssessorInsurerRelationship(data: typeof assessorInsurerRelationships.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assessorInsurerRelationships).values(data);
  return result;
}

export async function getAssessorsByTenant(tenantId: string) {
  const db = await getDb();
  if (!db) return [];

  const relationships = await db.select().from(assessorInsurerRelationships)
    .where(and(
      eq(assessorInsurerRelationships.tenantId, tenantId),
      eq(assessorInsurerRelationships.relationshipStatus, "active")
    ));

  if (relationships.length === 0) return [];

  const assessorIds = relationships.map(r => r.assessorId);
  const assessorList = await db.select().from(assessors).where(inArray(assessors.id, assessorIds));

  const userIds = assessorList.map(a => a.userId);
  const userList = await db.select().from(users).where(inArray(users.id, userIds));

  return assessorList.map(assessor => {
    const user = userList.find(u => u.id === assessor.userId);
    const relationship = relationships.find(r => r.assessorId === assessor.id);

    return {
      ...assessor,
      userName: user?.name,
      userEmail: user?.email,
      relationshipType: relationship?.relationshipType,
      totalAssignmentsCompleted: relationship?.totalAssignmentsCompleted || 0,
      performanceRating: relationship?.performanceRating,
      specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
      certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
      serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
    };
  });
}

export async function getMarketplaceAssessors(filters?: {
  serviceRegion?: string;
  specializations?: string[];
  minPerformanceScore?: number;
  minAverageRating?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(assessors)
    .where(and(
      eq(assessors.marketplaceEnabled, 1),
      eq(assessors.marketplaceStatus, "active"),
      eq(assessors.activeStatus, 1)
    ));

  const results = await query;

  // Apply filters
  let filtered = results;

  if (filters?.serviceRegion) {
    filtered = filtered.filter(a => {
      const regions = a.serviceRegions ? JSON.parse(a.serviceRegions) : [];
      return regions.includes(filters.serviceRegion);
    });
  }

  if (filters?.specializations && filters.specializations.length > 0) {
    filtered = filtered.filter(a => {
      const specs = a.specializations ? JSON.parse(a.specializations) : [];
      return filters.specializations!.some(s => specs.includes(s));
    });
  }

  if (filters?.minPerformanceScore) {
    filtered = filtered.filter(a => {
      const score = a.performanceScore ? parseFloat(a.performanceScore.toString()) : 0;
      return score >= filters.minPerformanceScore!;
    });
  }

  if (filters?.minAverageRating) {
    filtered = filtered.filter(a => {
      const rating = a.averageRating ? parseFloat(a.averageRating.toString()) : 0;
      return rating >= filters.minAverageRating!;
    });
  }

  return filtered.map(assessor => ({
    ...assessor,
    specializations: assessor.specializations ? JSON.parse(assessor.specializations) : [],
    certifications: assessor.certifications ? JSON.parse(assessor.certifications) : [],
    serviceRegions: assessor.serviceRegions ? JSON.parse(assessor.serviceRegions) : [],
  }));
}


// ============================================================================
// EVENT EMISSION
// ============================================================================

/**
 * Emit a claim event for workflow analytics and turnaround time tracking
 */
export async function emitClaimEvent(params: {
  claimId: number;
  eventType: string;
  userId?: number;
  userRole?: string;
  tenantId?: string;
  eventPayload?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Events] Cannot emit event: database not available");
    return;
  }

  try {
    await db.insert(claimEvents).values({
      claimId: params.claimId,
      eventType: params.eventType,
      userId: params.userId,
      userRole: params.userRole,
      tenantId: params.tenantId,
      eventPayload: params.eventPayload || null,
      emittedAt: new Date(),
    });
    
    console.log(`[Events] Emitted ${params.eventType} for claim ${params.claimId}`);
  } catch (error) {
    console.error(`[Events] Failed to emit ${params.eventType}:`, error);
    // Non-blocking: don't throw, just log
  }
}

// ============================================================
// DECISION SNAPSHOTS — Immutable audit persistence
// ============================================================

export interface DecisionSnapshotInput {
  claimId: string;
  tenantId: string;
  createdByUserId?: string;

  verdict: {
    decision: string;
    primaryReason: string;
    confidence: number;
  };

  cost: {
    aiEstimate: number;       // in cents
    quoted: number;           // in cents
    deviationPercent: number;
    fairRangeMin: number;     // in cents
    fairRangeMax: number;     // in cents
    verdict: string;
  };

  fraud: {
    score: number;
    level: string;
    contributions: Array<{ factor: string; value: number }>;
  };

  physics: {
    deltaV: number;
    velocityRange: string;
    energyKj: number;
    forceKn: number;
    estimated: boolean;
  };

  damage: {
    zones: string[];
    severity: string;
    consistencyScore: number;
  };

  enforcementTrace: Array<{ rule: string; value: unknown; threshold: string; triggered: boolean }>;
  confidenceBreakdown: Array<{ factor: string; penalty: number }>;

  dataQuality: {
    missingFields: string[];
    estimatedFields: string[];
    extractionConfidence: number;
  };
}

// ─── Spec-compliant snapshot shape (snake_case, no nulls) ───────────────────

export interface SpecSnapshot {
  // Identity
  claim_id: string;
  snapshot_version: number;
  created_at: number;          // Unix ms
  created_by_user_id: string;

  // Verdict
  verdict_decision: string;    // FINALISE_CLAIM | REVIEW_REQUIRED | ESCALATE_INVESTIGATION
  verdict_label: string;       // Human-readable label
  verdict_primary_reason: string;
  verdict_confidence: number;  // 0-100
  verdict_color: string;       // green | amber | red

  // Cost
  cost_ai_estimate_cents: number;
  cost_ai_estimate_display: number;  // dollars
  cost_quoted_cents: number;
  cost_quoted_display: number;       // dollars
  cost_deviation_percent: number;
  cost_fair_range_min_cents: number;
  cost_fair_range_max_cents: number;
  cost_fair_range_min_display: number;
  cost_fair_range_max_display: number;
  cost_verdict: string;              // FAIR | OVERPRICED | UNDERPRICED | NO_QUOTE

  // Fraud
  fraud_score: number;               // 0-100
  fraud_level: string;               // minimal | low | moderate | high | elevated
  fraud_level_label: string;
  fraud_contributions: Array<{ factor: string; value: number }>;

  // Physics
  delta_v: number;                   // km/h
  velocity_range: string;            // e.g. "40–60 km/h"
  energy_kj: number;
  force_kn: number;
  physics_estimated: boolean;

  // Damage
  damage_zones: string[];
  damage_severity: string;
  consistency_score: number;         // 0-100

  // Enforcement trace
  enforcement_trace: Array<{
    rule: string;
    value: string | number;
    threshold: string;
    triggered: boolean;
  }>;

  // Confidence breakdown
  confidence_breakdown: Array<{
    factor: string;
    penalty: number;
  }>;

  // Data quality
  missing_fields: string[];
  estimated_fields: string[];
  extraction_confidence: number;     // 0-100
}

/** Map verdict decision key to human-readable label */
function verdictLabel(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'FINALISE CLAIM';
  if (decision === 'REVIEW_REQUIRED') return 'REVIEW REQUIRED';
  if (decision === 'ESCALATE_INVESTIGATION') return 'ESCALATE INVESTIGATION';
  return decision.replace(/_/g, ' ');
}

/** Map verdict decision to color band */
function verdictColor(decision: string): string {
  if (decision === 'FINALISE_CLAIM') return 'green';
  if (decision === 'ESCALATE_INVESTIGATION') return 'red';
  return 'amber';
}

/** Map fraud level key to display label */
function fraudLevelLabel(level: string): string {
  const map: Record<string, string> = {
    minimal: 'Minimal',
    low: 'Low',
    moderate: 'Moderate',
    high: 'High',
    elevated: 'Elevated',
    critical: 'Elevated', // backward compat
  };
  return map[level.toLowerCase()] ?? level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Build the spec-compliant snake_case snapshot object from the input.
 * All fields are guaranteed non-null/non-undefined.
 */
export function buildSpecSnapshot(
  input: DecisionSnapshotInput,
  version: number,
): SpecSnapshot {
  const aiEstimateDollars = Math.round(input.cost.aiEstimate) / 100;
  const quotedDollars = Math.round(input.cost.quoted) / 100;
  const fairMinDollars = Math.round(input.cost.fairRangeMin) / 100;
  const fairMaxDollars = Math.round(input.cost.fairRangeMax) / 100;

  return {
    // Identity
    claim_id: input.claimId,
    snapshot_version: version,
    created_at: Date.now(),
    created_by_user_id: input.createdByUserId ?? 'system',

    // Verdict
    verdict_decision: input.verdict.decision,
    verdict_label: verdictLabel(input.verdict.decision),
    verdict_primary_reason: input.verdict.primaryReason,
    verdict_confidence: input.verdict.confidence,
    verdict_color: verdictColor(input.verdict.decision),

    // Cost
    cost_ai_estimate_cents: Math.round(input.cost.aiEstimate),
    cost_ai_estimate_display: aiEstimateDollars,
    cost_quoted_cents: Math.round(input.cost.quoted),
    cost_quoted_display: quotedDollars,
    cost_deviation_percent: Math.round(input.cost.deviationPercent),
    cost_fair_range_min_cents: Math.round(input.cost.fairRangeMin),
    cost_fair_range_max_cents: Math.round(input.cost.fairRangeMax),
    cost_fair_range_min_display: fairMinDollars,
    cost_fair_range_max_display: fairMaxDollars,
    cost_verdict: input.cost.verdict || 'FAIR',

    // Fraud
    fraud_score: input.fraud.score,
    fraud_level: input.fraud.level || 'minimal',
    fraud_level_label: fraudLevelLabel(input.fraud.level || 'minimal'),
    fraud_contributions: input.fraud.contributions.map(c => ({
      factor: c.factor,
      value: c.value,
    })),

    // Physics
    delta_v: input.physics.deltaV,
    velocity_range: input.physics.velocityRange || 'Not calculated',
    energy_kj: input.physics.energyKj,
    force_kn: input.physics.forceKn,
    physics_estimated: input.physics.estimated,

    // Damage
    damage_zones: input.damage.zones,
    damage_severity: input.damage.severity || 'unknown',
    consistency_score: input.damage.consistencyScore,

    // Enforcement trace
    enforcement_trace: input.enforcementTrace.map(t => ({
      rule: t.rule,
      value: t.value as string | number,
      threshold: t.threshold,
      triggered: t.triggered,
    })),

    // Confidence breakdown
    confidence_breakdown: input.confidenceBreakdown.map(c => ({
      factor: c.factor,
      penalty: c.penalty,
    })),

    // Data quality
    missing_fields: input.dataQuality.missingFields,
    estimated_fields: input.dataQuality.estimatedFields,
    extraction_confidence: input.dataQuality.extractionConfidence,
  };
}

/**
 * Persist an immutable Decision Snapshot for a claim.
 * Snapshots are append-only — never updated after creation.
 * Returns the new snapshot ID and version number.
 */
export async function saveDecisionSnapshot(input: DecisionSnapshotInput): Promise<{ id: number; version: number }> {
  // Determine next version number for this claim
  const existing = await db
    .select({ version: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, input.claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;

  const [result] = await db.insert(decisionSnapshots).values({
    claimId: input.claimId,
    tenantId: input.tenantId,
    snapshotVersion: nextVersion,
    createdAt: Date.now(),
    createdByUserId: input.createdByUserId ?? null,

    verdictDecision: input.verdict.decision,
    verdictPrimaryReason: input.verdict.primaryReason,
    verdictConfidence: input.verdict.confidence,

    costAiEstimate: input.cost.aiEstimate,
    costQuoted: input.cost.quoted,
    costDeviationPercent: Math.round(input.cost.deviationPercent),
    costFairRangeMin: input.cost.fairRangeMin,
    costFairRangeMax: input.cost.fairRangeMax,
    costVerdict: input.cost.verdict,

    fraudScore: input.fraud.score,
    fraudLevel: input.fraud.level,
    fraudContributionsJson: JSON.stringify(input.fraud.contributions),

    physicsDetlaV: Math.round(input.physics.deltaV * 10),
    physicsVelocityRange: input.physics.velocityRange,
    physicsEnergyKj: Math.round(input.physics.energyKj),
    physicsForceKn: Math.round(input.physics.forceKn),
    physicsEstimated: input.physics.estimated ? 1 : 0,

    damageZonesJson: JSON.stringify(input.damage.zones),
    damageSeverity: input.damage.severity,
    damageConsistencyScore: input.damage.consistencyScore,

    enforcementTraceJson: JSON.stringify(input.enforcementTrace),
    confidenceBreakdownJson: JSON.stringify(input.confidenceBreakdown),

    missingFieldsJson: JSON.stringify(input.dataQuality.missingFields),
    estimatedFieldsJson: JSON.stringify(input.dataQuality.estimatedFields),
    extractionConfidence: input.dataQuality.extractionConfidence,

    // Verbatim spec-compliant JSON — single source of truth
    snapshotJson: JSON.stringify(buildSpecSnapshot(input, nextVersion)),
  });

  return { id: Number((result as { insertId?: number }).insertId ?? 0), version: nextVersion };
}

/**
 * Retrieve all Decision Snapshots for a claim, ordered newest first.
 */
export async function getDecisionSnapshots(claimId: string): Promise<DecisionSnapshot[]> {
  return db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion));
}

/**
 * Get the latest Decision Snapshot for a claim, or null if none exists.
 */
export async function getLatestDecisionSnapshot(claimId: string): Promise<DecisionSnapshot | null> {
  const rows = await db
    .select()
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get the latest spec-compliant snapshot JSON for a claim.
 * Returns the parsed SpecSnapshot object, or null if no snapshot exists.
 */
export async function getLatestSnapshotJson(claimId: string): Promise<SpecSnapshot | null> {
  const rows = await db
    .select({ snapshotJson: decisionSnapshots.snapshotJson, snapshotVersion: decisionSnapshots.snapshotVersion })
    .from(decisionSnapshots)
    .where(eq(decisionSnapshots.claimId, claimId))
    .orderBy(desc(decisionSnapshots.snapshotVersion))
    .limit(1);
  if (!rows[0]) return null;
  const raw = rows[0].snapshotJson;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SpecSnapshot;
  } catch {
    return null;
  }
}

// ============================================================================
// COST INTELLIGENCE LEARNING RECORDS
// ============================================================================

import type { CostLearningRecord } from "./pipeline-v2/costLearningRecorder";

/**
 * Persist a CostLearningRecord extracted from Stage 9 to the database.
 * Safe to call fire-and-forget — errors are logged but never thrown.
 */
export async function insertCostLearningRecord(
  record: CostLearningRecord,
  tenantId?: string | null
): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[CostLearning] Database not available — skipping record persistence");
    return null;
  }

  try {
    const { costLearningRecords } = await import("../drizzle/schema");
    const result = await db.insert(costLearningRecords).values({
      claimId: typeof record.claim_id === "number" ? record.claim_id : parseInt(String(record.claim_id), 10),
      tenantId: tenantId ?? null,
      vehicleDescriptor: record.vehicle_descriptor.slice(0, 255),
      collisionDirection: record.collision_direction.slice(0, 50),
      marketRegion: record.market_region.slice(0, 10),
      caseSignature: record.case_signature.slice(0, 100),
      componentCount: record.component_count,
      structuralComponentCount: record.structural_component_count,
      finalCostUsdCents: record.final_cost_usd !== null ? Math.round(record.final_cost_usd * 100) : null,
      costIsAgreed: record.cost_is_agreed ? 1 : 0,
      quoteCoverageRatioPct: Math.round(record.quote_coverage_ratio * 100),
      highCostDriversJson: JSON.stringify(record.high_cost_drivers),
      componentWeightingJson: JSON.stringify(record.component_weighting),
      componentDetailJson: JSON.stringify(record.component_detail),
      qualityFlagsJson: JSON.stringify(record.quality_flags),
      recordedAt: record.recorded_at,
    });
    const insertId = (result as any)[0]?.insertId ?? null;
    console.log(`[CostLearning] Record persisted for claim ${record.claim_id} (id: ${insertId}, signature: ${record.case_signature})`);
    return insertId;
  } catch (err) {
    console.warn(`[CostLearning] Failed to persist record for claim ${record.claim_id}:`, err);
    return null;
  }
}

/**
 * getActiveCalibrationMultiplier
 *
 * Returns the most recent approved calibration cost multiplier for the given
 * tenant + jurisdiction combination. Falls back to 'global' if no
 * jurisdiction-specific override exists.
 *
 * The multiplier is stored as an integer × 1000 in the DB (e.g. 800 = 0.800).
 * Returns a float (e.g. 0.800) ready to multiply against cost estimates.
 * Returns 1.0 if no approved override exists.
 */
export async function getActiveCalibrationMultiplier(
  tenantId: string | null,
  jurisdiction: string,
  scenarioType?: string | null
): Promise<number> {
  try {
    const { calibrationOverrides } = await import("../drizzle/schema");
    const { eq, and, or, isNull, desc } = await import("drizzle-orm");

    // Try jurisdiction-specific first, then fall back to 'global'
    const jurisdictions = jurisdiction !== "global"
      ? [jurisdiction, "global"]
      : ["global"];

    for (const jur of jurisdictions) {
      const conditions = [
        eq(calibrationOverrides.status, "approved"),
        eq(calibrationOverrides.jurisdiction, jur),
      ];
      if (tenantId) {
        conditions.push(eq(calibrationOverrides.tenantId, tenantId));
      }

      const rows = await db
        .select({
          costMultiplier: calibrationOverrides.costMultiplier,
          scenarioType: calibrationOverrides.scenarioType,
        })
        .from(calibrationOverrides)
        .where(and(...conditions))
        .orderBy(desc(calibrationOverrides.approvedAt))
        .limit(10);

      if (rows.length === 0) continue;

      // Prefer scenario-specific match, then null (applies to all)
      const scenarioMatch = scenarioType
        ? rows.find((r) => r.scenarioType === scenarioType)
        : null;
      const globalMatch = rows.find((r) => r.scenarioType === null || r.scenarioType === undefined);

      const best = scenarioMatch ?? globalMatch ?? rows[0];
      if (best?.costMultiplier != null) {
        return best.costMultiplier / 1000; // convert int×1000 back to float
      }
    }

    return 1.0; // No override found — use identity multiplier
  } catch (err) {
    console.warn("[CalibrationOverride] Failed to fetch multiplier:", err);
    return 1.0;
  }
}
