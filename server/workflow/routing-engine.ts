/**
 * Routing Engine
 * 
 * Determines workflow paths based on configuration and claim attributes
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  WorkflowState,
  WorkflowConfiguration,
  EscalationRequirement,
  ClaimContext,
} from "./types";

/**
 * Default workflow configuration
 */
const DEFAULT_CONFIG: WorkflowConfiguration = {
  tenantId: "default",
  riskManagerEnabled: true,
  highValueThreshold: 1000000, // $10,000 in cents
  aiFastTrackEnabled: false,
  executiveReviewThreshold: 5000000, // $50,000 in cents
  externalAssessorEnabled: true,
  maxSequentialStagesByUser: 2,
};

/**
 * Routing Engine
 * 
 * Determines next state and routing based on configuration
 */
export class RoutingEngine {
  /**
   * Get workflow configuration for a tenant
   */
  async getConfiguration(tenantId: string): Promise<WorkflowConfiguration> {
    const db = await getDb();
    if (!db) return { ...DEFAULT_CONFIG, tenantId };
    
    const result = await db.execute(sql`
      SELECT *
      FROM workflow_configuration
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      // Return default configuration
      return { ...DEFAULT_CONFIG, tenantId };
    }

    const row = result.rows[0] as any;

    return {
      tenantId: row.tenant_id,
      riskManagerEnabled: Boolean(row.risk_manager_enabled),
      highValueThreshold: row.high_value_threshold,
      aiFastTrackEnabled: Boolean(row.ai_fast_track_enabled),
      executiveReviewThreshold: row.executive_review_threshold,
      externalAssessorEnabled: Boolean(row.external_assessor_enabled),
      maxSequentialStagesByUser: row.max_sequential_stages_by_user || 2,
    };
  }

  /**
   * Determine next state based on configuration and claim attributes
   */
  async determineNextState(
    claim: ClaimContext,
    currentState: WorkflowState,
    config: WorkflowConfiguration
  ): Promise<WorkflowState> {
    // Standard progression logic with configuration overrides

    switch (currentState) {
      case "created":
        return "intake_verified";

      case "intake_verified":
        return "assigned";

      case "assigned":
        return "under_assessment";

      case "under_assessment":
        return "internal_review";

      case "internal_review":
        // Check if risk manager is enabled
        if (config.riskManagerEnabled) {
          return "technical_approval";
        } else {
          // Skip risk manager, go directly to claims manager
          return "financial_decision";
        }

      case "technical_approval":
        return "financial_decision";

      case "financial_decision":
        return "payment_authorized";

      case "payment_authorized":
        return "closed";

      default:
        return currentState; // No automatic progression
    }
  }

  /**
   * Check if claim requires escalation
   */
  requiresEscalation(
    claim: ClaimContext,
    config: WorkflowConfiguration
  ): EscalationRequirement {
    // Check high-value threshold
    if (claim.estimatedCost >= config.highValueThreshold) {
      return {
        required: true,
        reason: `Claim value (${claim.estimatedCost / 100}) exceeds high-value threshold (${config.highValueThreshold / 100})`,
        targetRole: "claims_manager",
      };
    }

    // Check executive review threshold
    if (claim.estimatedCost >= config.executiveReviewThreshold) {
      return {
        required: true,
        reason: `Claim value (${claim.estimatedCost / 100}) exceeds executive review threshold (${config.executiveReviewThreshold / 100})`,
        targetRole: "executive",
      };
    }

    // Check fraud risk
    if (claim.aiAssessment?.fraudRiskLevel === "high") {
      return {
        required: true,
        reason: "High fraud risk detected by AI assessment",
        targetRole: "risk_manager",
      };
    }

    return {
      required: false,
      reason: "No escalation required",
    };
  }

  /**
   * Check if claim qualifies for AI fast track
   */
  canFastTrack(
    claim: ClaimContext,
    config: WorkflowConfiguration
  ): boolean {
    if (!config.aiFastTrackEnabled) {
      return false;
    }

    // Fast track criteria:
    // 1. Low fraud risk
    // 2. High AI confidence
    // 3. Below high-value threshold

    if (!claim.aiAssessment) {
      return false;
    }

    const { fraudRiskLevel, confidenceScore } = claim.aiAssessment;

    return (
      fraudRiskLevel === "low" &&
      confidenceScore >= 85 &&
      claim.estimatedCost < config.highValueThreshold
    );
  }

  /**
   * Determine if external assessor validation is required
   */
  requiresExternalValidation(
    claim: ClaimContext,
    config: WorkflowConfiguration
  ): boolean {
    // If external assessor is enabled and claim has external assessment
    // it requires internal validation checkpoint
    return config.externalAssessorEnabled;
  }

  /**
   * Update workflow configuration for a tenant
   */
  async updateConfiguration(
    config: WorkflowConfiguration
  ): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    await db.execute(sql`
      INSERT INTO workflow_configuration (
        tenant_id,
        risk_manager_enabled,
        high_value_threshold,
        ai_fast_track_enabled,
        executive_review_threshold,
        external_assessor_enabled,
        max_sequential_stages_by_user,
        updated_at
      ) VALUES (
        ${config.tenantId},
        ${config.riskManagerEnabled},
        ${config.highValueThreshold},
        ${config.aiFastTrackEnabled},
        ${config.executiveReviewThreshold},
        ${config.externalAssessorEnabled},
        ${config.maxSequentialStagesByUser},
        NOW()
      )
      ON DUPLICATE KEY UPDATE
        risk_manager_enabled = VALUES(risk_manager_enabled),
        high_value_threshold = VALUES(high_value_threshold),
        ai_fast_track_enabled = VALUES(ai_fast_track_enabled),
        executive_review_threshold = VALUES(executive_review_threshold),
        external_assessor_enabled = VALUES(external_assessor_enabled),
        max_sequential_stages_by_user = VALUES(max_sequential_stages_by_user),
        updated_at = NOW()
    `);
  }
}
