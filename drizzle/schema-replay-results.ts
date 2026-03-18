/**
 * Historical Replay Results Table
 * 
 * Stores comparison metrics when historical claims are replayed through current KINGA system.
 * Enables performance analysis and validation of AI routing decisions.
 */

import { mysqlTable, int, varchar, decimal, text, timestamp, json, tinyint, mysqlEnum } from "drizzle-orm/mysql-core";

export const historicalReplayResults = mysqlTable("historical_replay_results", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenant_id", { length: 64 }).notNull(),
  
  // Link to original historical claim
  historicalClaimId: int("historical_claim_id").notNull(),
  originalClaimReference: varchar("original_claim_reference", { length: 100 }),
  
  // Replay metadata
  replayedAt: timestamp("replayed_at").defaultNow().notNull(),
  replayedByUserId: int("replayed_by_user_id"), // User who triggered replay
  replayVersion: int("replay_version").default(1), // Increments for each replay of same claim
  
  // Policy used for replay
  policyVersionId: int("policy_version_id"), // automation_policies.id
  policyVersion: int("policy_version"), // automation_policies.version
  policyName: varchar("policy_name", { length: 255 }),
  
  // Original decision (from historical claim)
  originalDecision: mysqlEnum("original_decision", ["approved", "rejected", "referred", "total_loss", "cash_settlement"]),
  originalPayout: decimal("original_payout", { precision: 12, scale: 2 }), // finalApprovedCost from historical claim
  originalProcessingTimeHours: decimal("original_processing_time_hours", { precision: 10, scale: 2 }),
  originalAssessorName: varchar("original_assessor_name", { length: 255 }),
  
  // KINGA AI re-assessment results
  aiDamageDetectionScore: decimal("ai_damage_detection_score", { precision: 5, scale: 2 }), // 0-100
  aiEstimatedCost: decimal("ai_estimated_cost", { precision: 12, scale: 2 }),
  aiFraudScore: decimal("ai_fraud_score", { precision: 5, scale: 2 }), // 0-100
  aiConfidenceScore: decimal("ai_confidence_score", { precision: 5, scale: 2 }), // 0-100
  
  // KINGA routing decision
  kingaRoutingDecision: mysqlEnum("kinga_routing_decision", ["auto_approve", "hybrid_review", "escalate", "fraud_review"]),
  kingaPredictedPayout: decimal("kinga_predicted_payout", { precision: 12, scale: 2 }), // AI estimated cost
  kingaEstimatedProcessingTimeHours: decimal("kinga_estimated_processing_time_hours", { precision: 10, scale: 2 }),
  
  // Comparison metrics
  decisionMatch: tinyint("decision_match").notNull(), // 1 if KINGA decision matches original, 0 otherwise
  payoutVariance: decimal("payout_variance", { precision: 12, scale: 2 }), // originalPayout - kingaPredictedPayout
  payoutVariancePercentage: decimal("payout_variance_percentage", { precision: 5, scale: 2 }), // (variance / originalPayout) * 100
  processingTimeDelta: decimal("processing_time_delta", { precision: 10, scale: 2 }), // originalProcessingTime - kingaEstimatedProcessingTime
  processingTimeDeltaPercentage: decimal("processing_time_delta_percentage", { precision: 5, scale: 2 }),
  
  // Confidence analysis
  confidenceLevel: mysqlEnum("confidence_level", ["very_high", "high", "medium", "low", "very_low"]),
  confidenceJustification: text("confidence_justification"), // Explanation of confidence level
  
  // Fraud analysis
  fraudRiskLevel: mysqlEnum("fraud_risk_level", ["none", "low", "medium", "high", "critical", "elevated"]),
  fraudIndicators: json("fraud_indicators"), // Array of fraud indicators detected
  
  // Simulated workflow audit trail
  simulatedWorkflowSteps: json("simulated_workflow_steps"), // Array of workflow steps that would have been executed
  
  // Replay flags
  isReplay: tinyint("is_replay").default(1).notNull(), // Always 1 for replay results
  noLiveMutation: tinyint("no_live_mutation").default(1).notNull(), // Always 1 to indicate no live workflow changes
  
  // Analysis summary
  performanceSummary: text("performance_summary"), // Human-readable summary of comparison
  recommendedAction: mysqlEnum("recommended_action", ["adopt_kinga", "review_policy", "manual_review", "no_action"]),
  
  // Metadata
  replayDurationMs: int("replay_duration_ms"), // Time taken to complete replay
  replayStatus: mysqlEnum("replay_status", ["success", "partial_success", "failed"]).default("success").notNull(),
  replayErrors: json("replay_errors"), // Array of errors encountered during replay
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type HistoricalReplayResult = typeof historicalReplayResults.$inferSelect;
export type InsertHistoricalReplayResult = typeof historicalReplayResults.$inferInsert;
