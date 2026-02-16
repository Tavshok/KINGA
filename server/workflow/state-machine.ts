/**
 * Workflow State Machine Engine
 * 
 * Core engine that validates and executes state transitions with full governance checks.
 * This is the heart of the workflow governance system.
 */

import { getDb } from "../db";
import { claims } from "../../drizzle/schema";
import * as schema from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { AuditLogger } from "./audit-logger";
import { SegregationValidator } from "./segregation-validator";
import { RBACEngine } from "./rbac";
import {
  WorkflowState,
  InsurerRole,
  StateTransition,
  TransitionContext,
  TransitionMetadata,
  ValidationResult,
  TransitionResult,
  ValidationError,
  WorkflowViolationError,
  ClaimContext,
} from "./types";

/**
 * State transition matrix defining all valid transitions
 */
const STATE_TRANSITIONS: StateTransition[] = [
  {
    from: "created",
    to: "intake_verified",
    allowedRoles: ["claims_processor"],
    requiresSegregationCheck: false,
  },
  {
    from: "intake_verified",
    to: "assigned",
    allowedRoles: ["claims_processor"],
    requiresSegregationCheck: false,
  },
  {
    from: "assigned",
    to: "under_assessment",
    allowedRoles: ["assessor_internal", "assessor_external"],
    requiresSegregationCheck: false,
  },
  {
    from: "under_assessment",
    to: "internal_review",
    allowedRoles: ["assessor_internal", "assessor_external"],
    requiresSegregationCheck: true, // Start tracking critical stages
  },
  {
    from: "internal_review",
    to: "technical_approval",
    allowedRoles: ["risk_manager"],
    requiresSegregationCheck: true,
  },
  {
    from: "technical_approval",
    to: "financial_decision",
    allowedRoles: ["claims_manager"],
    requiresSegregationCheck: true,
  },
  {
    from: "financial_decision",
    to: "payment_authorized",
    allowedRoles: ["claims_manager"],
    requiresSegregationCheck: true,
  },
  {
    from: "payment_authorized",
    to: "closed",
    allowedRoles: ["claims_manager"],
    requiresSegregationCheck: false,
  },
  // Executive can move any claim to disputed
  {
    from: "created",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "intake_verified",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "assigned",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "under_assessment",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "internal_review",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "technical_approval",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "financial_decision",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
  {
    from: "payment_authorized",
    to: "disputed",
    allowedRoles: ["executive"],
    requiresSegregationCheck: false,
  },
];

/**
 * Workflow State Machine
 * 
 * Validates and executes state transitions with full governance enforcement
 */
export class WorkflowStateMachine {
  private auditLogger: AuditLogger;
  private segregationValidator: SegregationValidator;
  private rbacEngine: RBACEngine;

  constructor() {
    this.auditLogger = new AuditLogger();
    this.segregationValidator = new SegregationValidator();
    this.rbacEngine = new RBACEngine();
  }

  /**
   * Validates if a state transition is legal
   * @throws WorkflowViolationError if transition is invalid
   */
  validateTransition(
    from: WorkflowState,
    to: WorkflowState,
    role: InsurerRole,
    context: TransitionContext
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // Find matching transition rule
    const transitionRule = STATE_TRANSITIONS.find(
      (t) => t.from === from && t.to === to
    );

    if (!transitionRule) {
      errors.push({
        code: "INVALID_TRANSITION",
        message: `Transition from '${from}' to '${to}' is not allowed`,
      });
      return { valid: false, errors, warnings: [] };
    }

    // Check if role is allowed for this transition
    if (!transitionRule.allowedRoles.includes(role)) {
      errors.push({
        code: "ROLE_NOT_ALLOWED",
        message: `Role '${role}' cannot perform transition from '${from}' to '${to}'`,
      });
      return { valid: false, errors, warnings: [] };
    }

    return { valid: true, errors: [], warnings: [] };
  }

  /**
   * Executes a state transition with full governance checks
   * Creates audit trail, validates permissions, checks segregation
   */
  async executeTransition(
    claimId: number,
    to: WorkflowState,
    userId: number,
    userRole: InsurerRole,
    metadata: TransitionMetadata
  ): Promise<TransitionResult> {
    try {
      // 1. Get current claim state
      const db = await getDb();
      if (!db) throw new WorkflowViolationError("Database not available", "DB_UNAVAILABLE");
      
      const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);

      if (!claim) {
        throw new WorkflowViolationError(
          `Claim ${claimId} not found`,
          "CLAIM_NOT_FOUND"
        );
      }

      const from = claim.workflowState as WorkflowState;

      // 2. Validate transition
      const validationResult = this.validateTransition(from, to, userRole, {
        claimId,
        userId,
        userRole,
        metadata: metadata.additionalData,
      });

      if (!validationResult.valid) {
        return {
          success: false,
          newState: from,
          auditRecordId: 0,
          errors: validationResult.errors,
        };
      }

      // 3. Check segregation of duties (if required)
      const transitionRule = STATE_TRANSITIONS.find(
        (t) => t.from === from && t.to === to
      );

      if (transitionRule?.requiresSegregationCheck) {
        const segregationResult = await this.segregationValidator.validateSegregation(
          claimId,
          userId,
          "transition_state",
          to  // Pass the proposed state
        );

        if (!segregationResult.allowed) {
          throw new WorkflowViolationError(
            segregationResult.reason || "Segregation of duties violation",
            "SEGREGATION_VIOLATION",
            { userId, claimId, criticalStages: segregationResult.criticalStagesPerformed }
          );
        }
      }

      // 4. Create audit trail BEFORE making the change
      const auditRecord = await this.auditLogger.logTransition(
        claimId,
        { from, to, allowedRoles: transitionRule!.allowedRoles, requiresSegregationCheck: transitionRule!.requiresSegregationCheck },
        {
          userId,
          userRole,
          decisionValue: metadata.decisionValue,
          aiScore: metadata.aiScore,
          confidenceScore: metadata.confidenceScore,
          comments: metadata.comments,
          metadata: metadata.additionalData,
        }
      );

      // 5. Execute the state transition
      const dbInstance = await getDb();
      if (!dbInstance) throw new WorkflowViolationError("Database not available", "DB_UNAVAILABLE");
      
      await dbInstance.update(claims)
        .set({
          workflowState: to,
          updatedAt: new Date(),
        })
        .where(eq(claims.id, claimId));

      // 6. Track involvement for segregation
      await this.segregationValidator.trackInvolvement(
        claimId,
        userId,
        to,
        "transition_state"
      );

      return {
        success: true,
        newState: to,
        auditRecordId: auditRecord.id,
      };
    } catch (error) {
      if (error instanceof WorkflowViolationError) {
        return {
          success: false,
          newState: (await (await getDb())?.select().from(claims).where(eq(claims.id, claimId)).limit(1))?.[0]?.workflowState as WorkflowState,
          auditRecordId: 0,
          errors: [
            {
              code: error.code,
              message: error.message,
            },
          ],
        };
      }
      throw error;
    }
  }

  /**
   * Get all valid next states for a claim given current state and role
   */
  getValidNextStates(
    currentState: WorkflowState,
    role: InsurerRole
  ): WorkflowState[] {
    return STATE_TRANSITIONS
      .filter((t) => t.from === currentState && t.allowedRoles.includes(role))
      .map((t) => t.to);
  }

  /**
   * Check if a specific transition is valid
   */
  isTransitionValid(
    from: WorkflowState,
    to: WorkflowState,
    role: InsurerRole
  ): boolean {
    return STATE_TRANSITIONS.some(
      (t) => t.from === from && t.to === to && t.allowedRoles.includes(role)
    );
  }

  /**
   * Get transition rule for a specific transition
   */
  getTransitionRule(
    from: WorkflowState,
    to: WorkflowState
  ): StateTransition | undefined {
    return STATE_TRANSITIONS.find((t) => t.from === from && t.to === to);
  }

  /**
   * Get all possible transitions from a state
   */
  getTransitionsFromState(state: WorkflowState): StateTransition[] {
    return STATE_TRANSITIONS.filter((t) => t.from === state);
  }
}
