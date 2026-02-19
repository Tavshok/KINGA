// @ts-nocheck
/**
 * Fast-Track Engine
 * 
 * Evaluates claims against configurable fast-track automation rules.
 * Supports hierarchical configuration resolution (most specific wins):
 * 1. Claim type + product + tenant (most specific)
 * 2. Claim type + tenant (product-agnostic)
 * 3. Product + tenant (claim-type-agnostic)
 * 4. Tenant-wide default
 * 
 * Infrastructure-Grade Design:
 * - Immutable configuration (always insert new version, never update)
 * - Complete audit trail via fastTrackRoutingLog
 * - Deterministic rule evaluation
 * - Full tenant isolation
 * - No automatic financial approval without explicit configuration
 */

import { getDb } from "../db";
import {
  fastTrackConfig,
  fastTrackRoutingLog,
  claims,
  type FastTrackConfig,
  type InsertFastTrackRoutingLog,
} from "../../drizzle/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

/**
 * Fast-track action types
 */
export type FastTrackAction =
  | "AUTO_APPROVE"
  | "PRIORITY_QUEUE"
  | "REDUCED_DOCUMENTATION"
  | "STRAIGHT_TO_PAYMENT"
  | "MANUAL_REVIEW";

/**
 * Fast-track evaluation result
 */
export interface FastTrackEvaluationResult {
  eligible: boolean;
  action: FastTrackAction;
  configVersion: number | null;
  evaluationDetails: {
    configId: number | null;
    configSpecificity: "claim_type_product" | "claim_type" | "product" | "tenant_wide" | "none";
    confidenceScore: number;
    claimValue: number;
    fraudScore: number;
    claimType: string;
    productId: number | null;
    reason: string;
    thresholdsMet: {
      minConfidence: boolean;
      maxClaimValue: boolean;
      maxFraudScore: boolean;
    };
  };
}

/**
 * Fast-track evaluation parameters
 */
export interface FastTrackEvaluationParams {
  claimId: number;
  tenantId: string;
  confidenceScore: number; // 0-100
  claimValue: number; // In cents
  fraudScore: number; // 0-100
  claimType: string;
  productId: number | null;
}

/**
 * Custom error for fast-track validation failures
 */
export class FastTrackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FastTrackValidationError";
  }
}

/**
 * Validate tenant isolation - claim must belong to tenant
 */
async function validateTenantIsolation(claimId: number, tenantId: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const [claim] = await db.select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  
  if (!claim) {
    throw new FastTrackValidationError(`Claim ${claimId} not found`);
  }
  
  if (claim.tenantId !== tenantId) {
    throw new FastTrackValidationError(
      `Tenant isolation violation: Claim ${claimId} belongs to tenant ${claim.tenantId}, not ${tenantId}`
    );
  }
}

/**
 * Resolve most specific fast-track configuration for claim
 * 
 * Hierarchy (most specific wins):
 * 1. Claim type + product + tenant
 * 2. Claim type + tenant (product-agnostic)
 * 3. Product + tenant (claim-type-agnostic)
 * 4. Tenant-wide default
 */
async function resolveFastTrackConfig(params: {
  tenantId: string;
  claimType: string;
  productId: number | null;
}): Promise<FastTrackConfig | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const now = new Date();

  // 1. Try claim type + product + tenant (most specific)
  if (params.productId !== null) {
    const [config] = await db.select()
      .from(fastTrackConfig)
      .where(
        and(
          eq(fastTrackConfig.tenantId, params.tenantId),
          eq(fastTrackConfig.productId, params.productId),
          eq(fastTrackConfig.claimType, params.claimType as any),
          eq(fastTrackConfig.enabled, 1)
        )
      )
      .orderBy(desc(fastTrackConfig.version))
      .limit(1);

    if (config && new Date(config.effectiveFrom) <= now) {
      return config;
    }
  }

  // 2. Try claim type + tenant (product-agnostic)
  const [claimTypeConfig] = await db.select()
    .from(fastTrackConfig)
    .where(
      and(
        eq(fastTrackConfig.tenantId, params.tenantId),
        isNull(fastTrackConfig.productId),
        eq(fastTrackConfig.claimType, params.claimType as any),
        eq(fastTrackConfig.enabled, 1)
      )
    )
    .orderBy(desc(fastTrackConfig.version))
    .limit(1);

  if (claimTypeConfig && new Date(claimTypeConfig.effectiveFrom) <= now) {
    return claimTypeConfig;
  }

  // 3. Try product + tenant (claim-type-agnostic)
  if (params.productId !== null) {
    const [productConfig] = await db.select()
      .from(fastTrackConfig)
      .where(
        and(
          eq(fastTrackConfig.tenantId, params.tenantId),
          eq(fastTrackConfig.productId, params.productId),
          isNull(fastTrackConfig.claimType),
          eq(fastTrackConfig.enabled, 1)
        )
      )
      .orderBy(desc(fastTrackConfig.version))
      .limit(1);

    if (productConfig && new Date(productConfig.effectiveFrom) <= now) {
      return productConfig;
    }
  }

  // 4. Try tenant-wide default
  const [tenantConfig] = await db.select()
    .from(fastTrackConfig)
    .where(
      and(
        eq(fastTrackConfig.tenantId, params.tenantId),
        isNull(fastTrackConfig.productId),
        isNull(fastTrackConfig.claimType),
        eq(fastTrackConfig.enabled, 1)
      )
    )
    .orderBy(desc(fastTrackConfig.version))
    .limit(1);

  if (tenantConfig && new Date(tenantConfig.effectiveFrom) <= now) {
    return tenantConfig;
  }

  // No config found
  return null;
}

/**
 * Determine config specificity level
 */
function getConfigSpecificity(config: FastTrackConfig): "claim_type_product" | "claim_type" | "product" | "tenant_wide" {
  if (config.productId !== null && config.claimType !== null) {
    return "claim_type_product";
  }
  if (config.claimType !== null) {
    return "claim_type";
  }
  if (config.productId !== null) {
    return "product";
  }
  return "tenant_wide";
}

/**
 * Evaluate claim against fast-track configuration
 * 
 * Returns structured result with eligibility, action, and detailed evaluation context.
 * Logs all evaluations to fastTrackRoutingLog for audit trail.
 */
export async function evaluateFastTrack(
  params: FastTrackEvaluationParams
): Promise<FastTrackEvaluationResult> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate tenant isolation
  await validateTenantIsolation(params.claimId, params.tenantId);

  // Validate input parameters
  if (params.confidenceScore < 0 || params.confidenceScore > 100) {
    throw new FastTrackValidationError("Confidence score must be between 0 and 100");
  }
  if (params.fraudScore < 0 || params.fraudScore > 100) {
    throw new FastTrackValidationError("Fraud score must be between 0 and 100");
  }
  if (params.claimValue < 0) {
    throw new FastTrackValidationError("Claim value must be non-negative");
  }

  // Resolve most specific configuration
  const config = await resolveFastTrackConfig({
    tenantId: params.tenantId,
    claimType: params.claimType,
    productId: params.productId,
  });

  // If no config found, default to manual review
  if (!config) {
    const result: FastTrackEvaluationResult = {
      eligible: false,
      action: "MANUAL_REVIEW",
      configVersion: null,
      evaluationDetails: {
        configId: null,
        configSpecificity: "none",
        confidenceScore: params.confidenceScore,
        claimValue: params.claimValue,
        fraudScore: params.fraudScore,
        claimType: params.claimType,
        productId: params.productId,
        reason: "No fast-track configuration found for this claim type/product/tenant combination",
        thresholdsMet: {
          minConfidence: false,
          maxClaimValue: false,
          maxFraudScore: false,
        },
      },
    };

    // Log evaluation
    await logFastTrackEvaluation({
      claimId: params.claimId,
      tenantId: params.tenantId,
      configId: null,
      configVersion: null,
      eligible: false,
      decision: "MANUAL_REVIEW",
      reason: result.evaluationDetails.reason,
      confidenceScore: params.confidenceScore,
      claimValue: params.claimValue,
      fraudScore: params.fraudScore,
      claimType: params.claimType,
      productId: params.productId,
      override: false,
    });

    return result;
  }

  // Evaluate thresholds
  const minConfidenceMet = params.confidenceScore >= Number(config.minConfidenceScore);
  const maxClaimValueMet = params.claimValue <= config.maxClaimValue;
  const maxFraudScoreMet = params.fraudScore <= Number(config.maxFraudScore);

  const eligible = minConfidenceMet && maxClaimValueMet && maxFraudScoreMet;

  // Build reason
  let reason: string;
  if (eligible) {
    reason = `Claim eligible for ${config.fastTrackAction}: confidence ${params.confidenceScore}% >= ${config.minConfidenceScore}%, claim value ${params.claimValue} <= ${config.maxClaimValue}, fraud score ${params.fraudScore}% <= ${config.maxFraudScore}%`;
  } else {
    const failures: string[] = [];
    if (!minConfidenceMet) {
      failures.push(`confidence ${params.confidenceScore}% < ${config.minConfidenceScore}%`);
    }
    if (!maxClaimValueMet) {
      failures.push(`claim value ${params.claimValue} > ${config.maxClaimValue}`);
    }
    if (!maxFraudScoreMet) {
      failures.push(`fraud score ${params.fraudScore}% > ${config.maxFraudScore}%`);
    }
    reason = `Claim not eligible for fast-track: ${failures.join(", ")}`;
  }

  const result: FastTrackEvaluationResult = {
    eligible,
    action: eligible ? (config.fastTrackAction as FastTrackAction) : "MANUAL_REVIEW",
    configVersion: config.version,
    evaluationDetails: {
      configId: config.id,
      configSpecificity: getConfigSpecificity(config),
      confidenceScore: params.confidenceScore,
      claimValue: params.claimValue,
      fraudScore: params.fraudScore,
      claimType: params.claimType,
      productId: params.productId,
      reason,
      thresholdsMet: {
        minConfidence: minConfidenceMet,
        maxClaimValue: maxClaimValueMet,
        maxFraudScore: maxFraudScoreMet,
      },
    },
  };

  // Log evaluation
  await logFastTrackEvaluation({
    claimId: params.claimId,
    tenantId: params.tenantId,
    configId: config.id,
    configVersion: config.version,
    eligible,
    decision: result.action,
    reason,
    confidenceScore: params.confidenceScore,
    claimValue: params.claimValue,
    fraudScore: params.fraudScore,
    claimType: params.claimType,
    productId: params.productId,
    override: false,
  });

  return result;
}

/**
 * Log fast-track evaluation to audit trail
 */
async function logFastTrackEvaluation(params: {
  claimId: number;
  tenantId: string;
  configId: number | null;
  configVersion: number | null;
  eligible: boolean;
  decision: FastTrackAction;
  reason: string;
  confidenceScore: number;
  claimValue: number;
  fraudScore: number;
  claimType: string;
  productId: number | null;
  override: boolean;
  overrideBy?: number;
  overrideReason?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const logEntry: InsertFastTrackRoutingLog = {
    claimId: params.claimId,
    tenantId: params.tenantId,
    configId: params.configId,
    configVersion: params.configVersion,
    eligible: params.eligible ? 1 : 0,
    decision: params.decision,
    reason: params.reason,
    confidenceScore: params.confidenceScore.toString(),
    claimValue: params.claimValue,
    fraudScore: params.fraudScore.toString(),
    claimType: params.claimType,
    productId: params.productId,
    override: params.override ? 1 : 0,
    overrideBy: params.overrideBy,
    overrideReason: params.overrideReason,
  };

  await db.insert(fastTrackRoutingLog).values(logEntry);
}

/**
 * Get fast-track evaluation history for a claim
 */
export async function getFastTrackHistory(params: {
  claimId: number;
  tenantId: string;
}): Promise<Array<{
  id: number;
  configId: number | null;
  configVersion: number | null;
  eligible: boolean;
  decision: FastTrackAction;
  reason: string;
  confidenceScore: number;
  claimValue: number;
  fraudScore: number;
  override: boolean;
  evaluatedAt: Date;
}>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate tenant isolation
  await validateTenantIsolation(params.claimId, params.tenantId);

  const history = await db.select()
    .from(fastTrackRoutingLog)
    .where(
      and(
        eq(fastTrackRoutingLog.claimId, params.claimId),
        eq(fastTrackRoutingLog.tenantId, params.tenantId)
      )
    )
    .orderBy(desc(fastTrackRoutingLog.evaluatedAt));

  return history.map(entry => ({
    id: entry.id,
    configId: entry.configId,
    configVersion: entry.configVersion,
    eligible: entry.eligible === 1,
    decision: entry.decision as FastTrackAction,
    reason: entry.reason,
    confidenceScore: Number(entry.confidenceScore),
    claimValue: entry.claimValue,
    fraudScore: Number(entry.fraudScore),
    override: entry.override === 1,
    evaluatedAt: entry.evaluatedAt,
  }));
}

/**
 * Override fast-track decision (manual intervention)
 * 
 * Allows authorized users to override automatic fast-track decisions.
 * Creates new log entry with override flag.
 */
export async function overrideFastTrackDecision(params: {
  claimId: number;
  tenantId: string;
  newDecision: FastTrackAction;
  overrideBy: number;
  overrideReason: string;
  confidenceScore: number;
  claimValue: number;
  fraudScore: number;
  claimType: string;
  productId: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate tenant isolation
  await validateTenantIsolation(params.claimId, params.tenantId);

  // Validate override reason
  if (!params.overrideReason || params.overrideReason.trim().length < 20) {
    throw new FastTrackValidationError(
      `Override reason must be at least 20 characters, got ${params.overrideReason?.trim().length || 0}`
    );
  }

  // Log override
  await logFastTrackEvaluation({
    claimId: params.claimId,
    tenantId: params.tenantId,
    configId: null,
    configVersion: null,
    eligible: true, // Override assumes eligibility
    decision: params.newDecision,
    reason: `[MANUAL OVERRIDE] ${params.overrideReason}`,
    confidenceScore: params.confidenceScore,
    claimValue: params.claimValue,
    fraudScore: params.fraudScore,
    claimType: params.claimType,
    productId: params.productId,
    override: true,
    overrideBy: params.overrideBy,
    overrideReason: params.overrideReason,
  });
}
