/**
 * Immutable Routing Service
 * 
 * Enforces append-only routing decisions for claims.
 * All routing decisions are logged to routingHistory and NEVER updated or deleted.
 * Supports multiple routing events per claim (e.g., AI routing, then manual override).
 */

import { getDb } from "../db";
import { routingHistory, claims } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { getActiveThresholdConfig, getDefaultThresholdConfig, calculateRoutingCategoryWithThresholds, type ThresholdConfig } from "./threshold-version-management";

/**
 * Confidence components breakdown
 */
export interface ConfidenceComponents {
  fraudRisk: number;          // 0-100 (higher = lower risk)
  aiCertainty: number;        // 0-100 (AI model confidence)
  quoteVariance: number;      // 0-100 (lower variance = higher confidence)
  claimCompleteness: number;  // 0-100 (data completeness)
  historicalRisk: number;     // 0-100 (based on claimant/vehicle history)
}

/**
 * Routing category based on confidence score
 */
export type RoutingCategory = "HIGH" | "MEDIUM" | "LOW";

/**
 * Routing decision - what workflow path to take
 */
export type RoutingDecision = 
  | "AI_FAST_TRACK"       // HIGH confidence - AI handles entirely
  | "INTERNAL_REVIEW"     // MEDIUM confidence - internal assessor review
  | "EXTERNAL_REQUIRED"   // LOW confidence - external assessor required
  | "MANUAL_OVERRIDE";    // Manual override by authorized user

/**
 * Decision maker type
 */
export type DecidedBy = "AI" | "USER";

/**
 * Routing event parameters
 */
export interface CreateRoutingEventParams {
  claimId: number;
  tenantId: string;
  confidenceScore: number;
  confidenceComponents: ConfidenceComponents;
  routingCategory: RoutingCategory;
  routingDecision: RoutingDecision;
  thresholdConfigVersion: string;
  modelVersion: string;
  decidedBy: DecidedBy;
  decidedByUserId?: number;
  justification?: string;
}

/**
 * Validation error for routing events
 */
export class RoutingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingValidationError";
  }
}

/**
 * Generate immutable routing event ID
 * Format: routing_{timestamp}_{random}
 */
function generateRoutingId(): string {
  const timestamp = Date.now();
  const random = randomBytes(8).toString("hex");
  return `routing_${timestamp}_${random}`;
}

/**
 * Validate confidence score (0-100)
 */
function validateConfidenceScore(score: number): void {
  if (score < 0 || score > 100) {
    throw new RoutingValidationError(`Confidence score must be between 0 and 100, got ${score}`);
  }
}

/**
 * Validate confidence components (all 0-100)
 */
function validateConfidenceComponents(components: ConfidenceComponents): void {
  const fields: (keyof ConfidenceComponents)[] = [
    "fraudRisk",
    "aiCertainty",
    "quoteVariance",
    "claimCompleteness",
    "historicalRisk"
  ];
  
  for (const field of fields) {
    const value = components[field];
    if (value < 0 || value > 100) {
      throw new RoutingValidationError(`${field} must be between 0 and 100, got ${value}`);
    }
  }
}

/**
 * Validate manual override requires justification
 */
function validateManualOverride(params: CreateRoutingEventParams): void {
  if (params.decidedBy === "USER" && !params.justification) {
    throw new RoutingValidationError("Manual override requires justification");
  }
  
  if (params.decidedBy === "USER" && !params.decidedByUserId) {
    throw new RoutingValidationError("Manual override requires decidedByUserId");
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
    throw new RoutingValidationError(`Claim ${claimId} not found`);
  }
  
  if (claim.tenantId !== tenantId) {
    throw new RoutingValidationError(
      `Tenant isolation violation: Claim ${claimId} belongs to tenant ${claim.tenantId}, not ${tenantId}`
    );
  }
}

/**
 * Create immutable routing event (append-only)
 * 
 * This function enforces:
 * 1. Immutability - events are never updated or deleted
 * 2. Tenant isolation - claims can only be routed within their tenant
 * 3. Manual override validation - USER decisions require justification
 * 4. Confidence score validation - all scores must be 0-100
 * 
 * Multiple routing events per claim are allowed (append-only pattern).
 */
export async function createRoutingEvent(
  params: CreateRoutingEventParams
): Promise<{ id: string; timestamp: Date }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate confidence score
  validateConfidenceScore(params.confidenceScore);
  
  // Validate confidence components
  validateConfidenceComponents(params.confidenceComponents);
  
  // Validate manual override
  validateManualOverride(params);
  
  // Validate tenant isolation
  await validateTenantIsolation(params.claimId, params.tenantId);
  
  // Generate immutable ID
  const routingId = generateRoutingId();
  
  // Insert routing event (append-only, never update)
  const timestamp = new Date();
  await db.insert(routingHistory).values({
    id: routingId,
    claimId: params.claimId,
    tenantId: params.tenantId,
    confidenceScore: params.confidenceScore.toFixed(2),
    confidenceComponents: JSON.stringify(params.confidenceComponents),
    routingCategory: params.routingCategory,
    routingDecision: params.routingDecision,
    thresholdConfigVersion: params.thresholdConfigVersion,
    modelVersion: params.modelVersion,
    decidedBy: params.decidedBy,
    decidedByUserId: params.decidedByUserId || null,
    justification: params.justification || null,
    timestamp,
  });
  
  return { id: routingId, timestamp };
}

/**
 * Get routing history for a claim (ordered by timestamp DESC)
 * Returns all routing events for the claim (append-only audit trail)
 */
export async function getRoutingHistory(params: {
  claimId: number;
  tenantId: string;
}): Promise<Array<{
  id: string;
  confidenceScore: string;
  confidenceComponents: ConfidenceComponents;
  routingCategory: RoutingCategory;
  routingDecision: RoutingDecision;
  thresholdConfigVersion: string;
  modelVersion: string;
  decidedBy: DecidedBy;
  decidedByUserId: number | null;
  justification: string | null;
  timestamp: Date;
}>> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database connection not available");
  }

  // Validate tenant isolation
  await validateTenantIsolation(params.claimId, params.tenantId);
  
  const events = await db.select()
    .from(routingHistory)
    .where(
      and(
        eq(routingHistory.claimId, params.claimId),
        eq(routingHistory.tenantId, params.tenantId)
      )
    )
    .orderBy(desc(routingHistory.timestamp));
  
  return events.map(event => ({
    id: event.id,
    confidenceScore: event.confidenceScore,
    confidenceComponents: JSON.parse(event.confidenceComponents) as ConfidenceComponents,
    routingCategory: event.routingCategory,
    routingDecision: event.routingDecision,
    thresholdConfigVersion: event.thresholdConfigVersion,
    modelVersion: event.modelVersion,
    decidedBy: event.decidedBy,
    decidedByUserId: event.decidedByUserId,
    justification: event.justification,
    timestamp: event.timestamp,
  }));
}

/**
 * Get latest routing decision for a claim
 * Returns the most recent routing event (by timestamp)
 */
export async function getLatestRoutingDecision(params: {
  claimId: number;
  tenantId: string;
}): Promise<{
  id: string;
  confidenceScore: string;
  confidenceComponents: ConfidenceComponents;
  routingCategory: RoutingCategory;
  routingDecision: RoutingDecision;
  thresholdConfigVersion: string;
  modelVersion: string;
  decidedBy: DecidedBy;
  decidedByUserId: number | null;
  justification: string | null;
  timestamp: Date;
} | null> {
  const history = await getRoutingHistory(params);
  return history[0] || null;
}

/**
 * Calculate routing category from confidence score using active threshold config
 * 
 * Fetches active threshold configuration for tenant and applies thresholds.
 * Falls back to default thresholds if no active configuration exists.
 */
export async function calculateRoutingCategory(
  confidenceScore: number,
  tenantId: string
): Promise<RoutingCategory> {
  const activeConfig = await getActiveThresholdConfig(tenantId);
  const thresholds = activeConfig || getDefaultThresholdConfig();
  
  return calculateRoutingCategoryWithThresholds(confidenceScore, thresholds);
}

/**
 * Determine routing decision from category
 * 
 * Mapping:
 * - HIGH -> AI_FAST_TRACK
 * - MEDIUM -> INTERNAL_REVIEW
 * - LOW -> EXTERNAL_REQUIRED
 */
export function determineRoutingDecision(category: RoutingCategory): RoutingDecision {
  switch (category) {
    case "HIGH":
      return "AI_FAST_TRACK";
    case "MEDIUM":
      return "INTERNAL_REVIEW";
    case "LOW":
      return "EXTERNAL_REQUIRED";
  }
}

/**
 * Calculate composite confidence score from components
 * 
 * Weighted average:
 * - fraudRisk: 25%
 * - aiCertainty: 25%
 * - quoteVariance: 20%
 * - claimCompleteness: 15%
 * - historicalRisk: 15%
 */
export function calculateConfidenceScore(components: ConfidenceComponents): number {
  const weights = {
    fraudRisk: 0.25,
    aiCertainty: 0.25,
    quoteVariance: 0.20,
    claimCompleteness: 0.15,
    historicalRisk: 0.15,
  };
  
  const score = 
    components.fraudRisk * weights.fraudRisk +
    components.aiCertainty * weights.aiCertainty +
    components.quoteVariance * weights.quoteVariance +
    components.claimCompleteness * weights.claimCompleteness +
    components.historicalRisk * weights.historicalRisk;
  
  return Math.round(score * 100) / 100; // Round to 2 decimal places
}
