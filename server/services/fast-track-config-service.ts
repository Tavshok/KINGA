/**
 * Fast-Track Configuration Service
 * 
 * Service-layer enforcement of governance guardrails for fast-track configuration.
 * 
 * All validation occurs at the service layer - UI validation is NOT sufficient.
 * Platform governance limits prevent insurers from configuring unsafe automation rules.
 */

import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  fastTrackConfig,
  platformGovernanceLimits,
  governanceViolationLog,
  type InsertFastTrackConfig,
  type FastTrackConfig,
  type PlatformGovernanceLimits,
} from "../../drizzle/schema";

/**
 * Governance validation error
 */
export class GovernanceViolationError extends Error {
  constructor(
    public violationType: string,
    public reason: string,
    public attemptedConfig: any
  ) {
    super(`Governance violation: ${reason}`);
    this.name = "GovernanceViolationError";
  }
}

/**
 * Configuration creation parameters
 */
export interface CreateFastTrackConfigParams {
  tenantId: string;
  productId?: number;
  claimType?: string;
  fastTrackAction: "AUTO_APPROVE" | "PRIORITY_QUEUE" | "REDUCED_DOCUMENTATION" | "STRAIGHT_TO_PAYMENT";
  minConfidenceScore: string; // Decimal string
  maxClaimValue: number;
  maxFraudScore: string; // Decimal string
  enabled: number; // 1 or 0
  effectiveFrom: Date;
  createdBy: number; // User ID
  userRole: string; // User role for audit
  justification?: string; // Required for sensitive changes
}

/**
 * Get active platform governance limits
 */
export async function getActiveGovernanceLimits(): Promise<PlatformGovernanceLimits | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const now = new Date();

  const [limits] = await db
    .select()
    .from(platformGovernanceLimits)
    .where(eq(platformGovernanceLimits.effectiveFrom, now))
    .orderBy(desc(platformGovernanceLimits.version))
    .limit(1);

  if (!limits) {
    // Return default conservative limits if none configured
    return {
      id: 0,
      maxAutoApprovalLimitGlobal: 5000000, // R50,000 in cents
      minConfidenceAllowedGlobal: "85.00",
      maxFraudToleranceGlobal: "10.00",
      version: 0,
      effectiveFrom: new Date(),
      createdBy: 0,
      createdAt: new Date(),
      notes: "Default platform limits",
    };
  }

  return limits;
}

/**
 * Log governance violation
 */
async function logGovernanceViolation(params: {
  tenantId: string;
  userId: number;
  userRole: string;
  violationType: string;
  attemptedConfig: any;
  governanceLimits: PlatformGovernanceLimits;
  reason: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  await db.insert(governanceViolationLog).values({
    tenantId: params.tenantId,
    userId: params.userId,
    userRole: params.userRole,
    violationType: params.violationType as any,
    attemptedConfig: JSON.stringify(params.attemptedConfig),
    governanceLimitsVersion: params.governanceLimits.version,
    governanceLimitsSnapshot: JSON.stringify({
      maxAutoApprovalLimit: params.governanceLimits.maxAutoApprovalLimitGlobal,
      minConfidenceAllowed: params.governanceLimits.minConfidenceAllowedGlobal,
      maxFraudTolerance: params.governanceLimits.maxFraudToleranceGlobal,
    }),
    reason: params.reason,
  });
}

/**
 * Validate justification length
 */
function validateJustification(justification: string | undefined, required: boolean): void {
  if (required && (!justification || justification.trim().length < 20)) {
    throw new GovernanceViolationError(
      "INSUFFICIENT_JUSTIFICATION",
      "Justification must be at least 20 characters",
      { justification }
    );
  }
}

/**
 * Create fast-track configuration with governance validation
 * 
 * Enforces platform-level governance limits:
 * - Auto-approve cannot exceed global financial limit
 * - Confidence threshold cannot be below allowed minimum
 * - Fraud tolerance cannot exceed allowed maximum
 * - Sensitive changes require justification
 * 
 * All violations are logged to governanceViolationLog for audit trail.
 */
export async function createFastTrackConfig(
  params: CreateFastTrackConfigParams
): Promise<FastTrackConfig> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Get active governance limits
  const governanceLimits = await getActiveGovernanceLimits();
  if (!governanceLimits) {
    throw new Error("No active governance limits found");
  }

  // Validate justification requirements for sensitive changes
  const requiresJustification = 
    params.fastTrackAction === "AUTO_APPROVE" ||
    params.fastTrackAction === "STRAIGHT_TO_PAYMENT";

  if (requiresJustification) {
    try {
      validateJustification(params.justification, true);
    } catch (error) {
      if (error instanceof GovernanceViolationError) {
        await logGovernanceViolation({
          tenantId: params.tenantId,
          userId: params.createdBy,
          userRole: params.userRole,
          violationType: error.violationType,
          attemptedConfig: params,
          governanceLimits,
          reason: error.reason,
        });
      }
      throw error;
    }
  }

  // Validate against platform governance limits
  const confidenceScore = parseFloat(params.minConfidenceScore);
  const fraudScore = parseFloat(params.maxFraudScore);
  const minConfidenceAllowed = parseFloat(String(governanceLimits.minConfidenceAllowedGlobal));
  const maxFraudTolerance = parseFloat(String(governanceLimits.maxFraudToleranceGlobal));

  // Check: Auto-approve above global financial limit
  if (
    (params.fastTrackAction === "AUTO_APPROVE" || params.fastTrackAction === "STRAIGHT_TO_PAYMENT") &&
    params.maxClaimValue > governanceLimits.maxAutoApprovalLimitGlobal
  ) {
    const reason = `Auto-approval limit ${params.maxClaimValue} exceeds global maximum ${governanceLimits.maxAutoApprovalLimitGlobal}`;
    await logGovernanceViolation({
      tenantId: params.tenantId,
      userId: params.createdBy,
      userRole: params.userRole,
      violationType: "EXCEEDS_AUTO_APPROVAL_LIMIT",
      attemptedConfig: params,
      governanceLimits,
      reason,
    });
    throw new GovernanceViolationError("EXCEEDS_AUTO_APPROVAL_LIMIT", reason, params);
  }

  // Check: Confidence threshold below allowed minimum
  if (confidenceScore < minConfidenceAllowed) {
    const reason = `Confidence threshold ${confidenceScore}% is below global minimum ${minConfidenceAllowed}%`;
    await logGovernanceViolation({
      tenantId: params.tenantId,
      userId: params.createdBy,
      userRole: params.userRole,
      violationType: "BELOW_MIN_CONFIDENCE",
      attemptedConfig: params,
      governanceLimits,
      reason,
    });
    throw new GovernanceViolationError("BELOW_MIN_CONFIDENCE", reason, params);
  }

  // Check: Fraud tolerance above allowed maximum
  if (fraudScore > maxFraudTolerance) {
    const reason = `Fraud tolerance ${fraudScore}% exceeds global maximum ${maxFraudTolerance}%`;
    await logGovernanceViolation({
      tenantId: params.tenantId,
      userId: params.createdBy,
      userRole: params.userRole,
      violationType: "EXCEEDS_MAX_FRAUD_TOLERANCE",
      attemptedConfig: params,
      governanceLimits,
      reason,
    });
    throw new GovernanceViolationError("EXCEEDS_MAX_FRAUD_TOLERANCE", reason, params);
  }

  // Get next version number for this tenant
  const existingConfigs = await db
    .select()
    .from(fastTrackConfig)
    .where(eq(fastTrackConfig.tenantId, params.tenantId))
    .orderBy(desc(fastTrackConfig.version))
    .limit(1);

  const nextVersion = existingConfigs.length > 0 ? existingConfigs[0].version + 1 : 1;

  // Create configuration
  const configData: InsertFastTrackConfig = {
    tenantId: params.tenantId,
    productId: params.productId,
    claimType: params.claimType as any,
    fastTrackAction: params.fastTrackAction,
    minConfidenceScore: params.minConfidenceScore,
    maxClaimValue: params.maxClaimValue,
    maxFraudScore: params.maxFraudScore,
    enabled: params.enabled,
    version: nextVersion,
    effectiveFrom: params.effectiveFrom,
    createdBy: params.createdBy,
  };

  const [result] = await db.insert(fastTrackConfig).values(configData);

  // Fetch and return the created config
  const [created] = await db
    .select()
    .from(fastTrackConfig)
    .where(eq(fastTrackConfig.id, result.insertId))
    .limit(1);

  if (!created) {
    throw new Error("Failed to create fast-track configuration");
  }

  return created;
}

/**
 * Get governance violation history for a tenant
 */
export async function getGovernanceViolations(tenantId: string): Promise<any[]> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  return db
    .select()
    .from(governanceViolationLog)
    .where(eq(governanceViolationLog.tenantId, tenantId))
    .orderBy(desc(governanceViolationLog.violatedAt));
}
