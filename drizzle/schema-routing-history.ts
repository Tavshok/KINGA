/**
 * Routing History Table - Immutable Append-Only Routing Decisions
 * 
 * This table enforces immutable, append-only routing decisions for claims.
 * All routing decisions are logged here and NEVER updated or deleted.
 * Multiple routing events per claim are allowed (e.g., AI routing, then manual override).
 */

import { mysqlTable, varchar, int, decimal, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";

/**
 * Routing History - Immutable audit trail of all routing decisions
 */
export const routingHistory = mysqlTable("routing_history", {
  // Primary key - UUID for immutability
  id: varchar("id", { length: 64 }).primaryKey(), // UUID format: routing_{timestamp}_{random}
  
  // Claim reference
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Confidence score (0-100)
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }).notNull(),
  
  // Confidence components (JSON object with breakdown)
  // Example: { fraudRisk: 85, aiCertainty: 90, quoteVariance: 75, claimCompleteness: 95, historicalRisk: 80 }
  confidenceComponents: text("confidence_components").notNull(),
  
  // Routing category based on confidence score
  routingCategory: mysqlEnum("routing_category", ["HIGH", "MEDIUM", "LOW"]).notNull(),
  
  // Routing decision - what workflow path to take
  routingDecision: mysqlEnum("routing_decision", [
    "AI_FAST_TRACK",        // HIGH confidence - AI handles entirely
    "INTERNAL_REVIEW",      // MEDIUM confidence - internal assessor review
    "EXTERNAL_REQUIRED",    // LOW confidence - external assessor required
    "MANUAL_OVERRIDE"       // Manual override by authorized user
  ]).notNull(),
  
  // Configuration version tracking
  thresholdConfigVersion: varchar("threshold_config_version", { length: 50 }).notNull(),
  modelVersion: varchar("model_version", { length: 50 }).notNull(),
  
  // Decision maker tracking
  decidedBy: mysqlEnum("decided_by", ["AI", "USER"]).notNull(),
  decidedByUserId: int("decided_by_user_id"), // NULL if decidedBy = "AI"
  
  // Justification (required for manual override)
  justification: text("justification"), // Required when decidedBy = "USER"
  
  // Immutable timestamp
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type RoutingHistory = typeof routingHistory.$inferSelect;
export type InsertRoutingHistory = typeof routingHistory.$inferInsert;
