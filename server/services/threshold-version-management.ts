// @ts-nocheck
/**
 * Threshold Version Management Service
 * 
 * Manages version-controlled threshold configurations for routing decisions.
 * Ensures only one active threshold version per tenant at any time.
 * Changing thresholds creates a new version without affecting past routing decisions.
 */

import { getDb } from "../db";
import { routingThresholdConfig } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

/**
 * Threshold configuration parameters
 */
export interface ThresholdConfig {
  highThreshold: number;      // Threshold for HIGH confidence (default: 80)
  mediumThreshold: number;    // Threshold for MEDIUM confidence (default: 50)
  aiFastTrackEnabled: boolean; // Whether AI fast-track is enabled
}

/**
 * Create threshold version parameters
 */
export interface CreateThresholdVersionParams {
  tenantId: string;
  version: string;
  highThreshold: number;
  mediumThreshold: number;
  aiFastTrackEnabled: boolean;
  createdByUserId: number;
}

/**
 * Validation error for threshold operations
 */
export class ThresholdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdValidationError";
  }
}

/**
 * Generate immutable threshold config ID
 * Format: threshold_{timestamp}_{random}
 */
function generateThresholdId(): string {
  const timestamp = Date.now();
  const random = randomBytes(8).toString("hex");
  return `threshold_${timestamp}_${random}`;
}

/**
 * Validate threshold values (0-100)
 */
function validateThresholds(highThreshold: number, mediumThreshold: number): void {
  if (highThreshold < 0 || highThreshold > 100) {
    throw new ThresholdValidationError(`High threshold must be between 0 and 100, got ${highThreshold}`);
  }
  
  if (mediumThreshold < 0 || mediumThreshold > 100) {
    throw new ThresholdValidationError(`Medium threshold must be between 0 and 100, got ${mediumThreshold}`);
  }
  
  if (mediumThreshold >= highThreshold) {
    throw new ThresholdValidationError(
      `Medium threshold (${mediumThreshold}) must be less than high threshold (${highThreshold})`
    );
  }
}

/**
 * Get active threshold configuration for a tenant
 * Returns null if no active configuration exists
 */
export async function getActiveThresholdConfig(tenantId: string): Promise<{
  id: string;
  version: string;
  highThreshold: number;
  mediumThreshold: number;
  aiFastTrackEnabled: boolean;
  createdByUserId: number;
  createdAt: Date;
} | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const [config] = await db.select()
    .from(routingThresholdConfig)
    .where(
      and(
        eq(routingThresholdConfig.tenantId, tenantId),
        eq(routingThresholdConfig.isActive, true)
      )
    )
    .limit(1);
  
  if (!config) {
    return null;
  }
  
  return {
    id: config.id,
    version: config.version,
    highThreshold: parseFloat(config.highThreshold),
    mediumThreshold: parseFloat(config.mediumThreshold),
    aiFastTrackEnabled: config.aiFastTrackEnabled,
    createdByUserId: config.createdByUserId,
    createdAt: config.createdAt,
  };
}

/**
 * Create new threshold version
 * 
 * This function:
 * 1. Validates threshold values
 * 2. Deactivates existing active version (if any)
 * 3. Creates new active version
 * 4. Enforces only one active version per tenant
 */
export async function createThresholdVersion(
  params: CreateThresholdVersionParams
): Promise<{ id: string; version: string }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate threshold values
  validateThresholds(params.highThreshold, params.mediumThreshold);
  
  // Check if version already exists for this tenant
  const [existingVersion] = await db.select()
    .from(routingThresholdConfig)
    .where(
      and(
        eq(routingThresholdConfig.tenantId, params.tenantId),
        eq(routingThresholdConfig.version, params.version)
      )
    )
    .limit(1);
  
  if (existingVersion) {
    throw new ThresholdValidationError(
      `Threshold version ${params.version} already exists for tenant ${params.tenantId}`
    );
  }
  
  // Deactivate existing active version (if any)
  await db.update(routingThresholdConfig)
    .set({ isActive: false })
    .where(
      and(
        eq(routingThresholdConfig.tenantId, params.tenantId),
        eq(routingThresholdConfig.isActive, true)
      )
    );
  
  // Generate immutable ID
  const thresholdId = generateThresholdId();
  
  // Create new active version
  await db.insert(routingThresholdConfig).values({
    id: thresholdId,
    tenantId: params.tenantId,
    version: params.version,
    highThreshold: params.highThreshold.toFixed(2),
    mediumThreshold: params.mediumThreshold.toFixed(2),
    aiFastTrackEnabled: params.aiFastTrackEnabled,
    createdByUserId: params.createdByUserId,
    isActive: true,
  });
  
  return { id: thresholdId, version: params.version };
}

/**
 * Deactivate threshold version
 * Used when rolling back to a previous version or disabling thresholds
 */
export async function deactivateThresholdVersion(params: {
  tenantId: string;
  version: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const result = await db.update(routingThresholdConfig)
    .set({ isActive: false })
    .where(
      and(
        eq(routingThresholdConfig.tenantId, params.tenantId),
        eq(routingThresholdConfig.version, params.version)
      )
    );
  
  // Note: Drizzle doesn't return affected rows count in the same way as raw SQL
  // We'll verify by querying the updated record
  const [updated] = await db.select()
    .from(routingThresholdConfig)
    .where(
      and(
        eq(routingThresholdConfig.tenantId, params.tenantId),
        eq(routingThresholdConfig.version, params.version),
        eq(routingThresholdConfig.isActive, false)
      )
    )
    .limit(1);
  
  if (!updated) {
    throw new ThresholdValidationError(
      `Threshold version ${params.version} not found for tenant ${params.tenantId}`
    );
  }
}

/**
 * Get all threshold versions for a tenant (ordered by creation date DESC)
 */
export async function getThresholdVersionHistory(tenantId: string): Promise<Array<{
  id: string;
  version: string;
  highThreshold: number;
  mediumThreshold: number;
  aiFastTrackEnabled: boolean;
  createdByUserId: number;
  createdAt: Date;
  isActive: boolean;
}>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  const versions = await db.select()
    .from(routingThresholdConfig)
    .where(eq(routingThresholdConfig.tenantId, tenantId))
    .orderBy(routingThresholdConfig.createdAt);
  
  return versions.map(v => ({
    id: v.id,
    version: v.version,
    highThreshold: parseFloat(v.highThreshold),
    mediumThreshold: parseFloat(v.mediumThreshold),
    aiFastTrackEnabled: v.aiFastTrackEnabled,
    createdByUserId: v.createdByUserId,
    createdAt: v.createdAt,
    isActive: v.isActive,
  }));
}

/**
 * Get default threshold configuration
 * Used when no active configuration exists for a tenant
 */
export function getDefaultThresholdConfig(): ThresholdConfig {
  return {
    highThreshold: 80,
    mediumThreshold: 50,
    aiFastTrackEnabled: true,
  };
}

/**
 * Calculate routing category from confidence score using threshold config
 */
export function calculateRoutingCategoryWithThresholds(
  confidenceScore: number,
  thresholds: ThresholdConfig
): "HIGH" | "MEDIUM" | "LOW" {
  if (confidenceScore >= thresholds.highThreshold) {
    return "HIGH";
  } else if (confidenceScore >= thresholds.mediumThreshold) {
    return "MEDIUM";
  } else {
    return "LOW";
  }
}
