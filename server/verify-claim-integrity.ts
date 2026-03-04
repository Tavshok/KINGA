/**
 * verifyClaimIntegrity — KINGA AutoVerify AI
 *
 * Validates the internal consistency of a single claim record.
 * Returns a structured report of all integrity issues found.
 *
 * Used by:
 *  - /platform/claim-debug/:claimId (super-admin debug page)
 *  - The claim lifecycle E2E test suite
 *  - Manual ops tooling
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, count } from "drizzle-orm";
import {
  claims,
  panelBeaterQuotes,
  quoteOptimisationResults,
  aiAssessments,
  users,
} from "../drizzle/schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = MySql2Database<any>;

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntegrityCheckSeverity = "error" | "warning" | "info";

export interface IntegrityIssue {
  code: string;
  severity: IntegrityCheckSeverity;
  message: string;
  field?: string;
}

export interface ClaimIntegrityReport {
  claimId: number;
  claimRef: string | null;
  status: string | null;
  tenantId: string | null;
  issues: IntegrityIssue[];
  passed: boolean; // true if no "error" severity issues
  checkedAt: string; // ISO-8601
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkClaimExists(
  db: Db,
  claimId: number
): Promise<typeof claims.$inferSelect | null> {
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  return claim ?? null;
}

async function checkAssessorAssigned(
  db: Db,
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  // If status is past "submitted", an assessor should be assigned
  const statusesRequiringAssessor = new Set([
    "under_review",
    "assessed",
    "awaiting_decision",
    "completed",
  ]);

  if (statusesRequiringAssessor.has(claim.status) && !claim.assignedAssessorId) {
    issues.push({
      code: "ASSESSOR_MISSING",
      severity: "error",
      field: "assignedAssessorId",
      message: `Claim is in status "${claim.status}" but has no assigned assessor.`,
    });
  }

  // Verify the assigned assessor user actually exists
  if (claim.assignedAssessorId) {
    const [assessorUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, claim.assignedAssessorId))
      .limit(1);

    if (!assessorUser) {
      issues.push({
        code: "ASSESSOR_USER_NOT_FOUND",
        severity: "error",
        field: "assignedAssessorId",
        message: `Assigned assessor userId ${claim.assignedAssessorId} does not exist in the users table.`,
      });
    }
  }
}

async function checkQuotesExist(
  db: Db,
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  const statusesRequiringQuotes = new Set([
    "awaiting_decision",
    "completed",
  ]);

  if (!statusesRequiringQuotes.has(claim.status)) return;

  const [{ value: quoteCount }] = await db
    .select({ value: count() })
    .from(panelBeaterQuotes)
    .where(eq(panelBeaterQuotes.claimId, claim.id));

  if (Number(quoteCount) === 0) {
    issues.push({
      code: "NO_QUOTES",
      severity: "error",
      field: "panelBeaterQuotes",
      message: `Claim is in status "${claim.status}" but has no panel beater quotes.`,
    });
  }
}

async function checkOptimisationConsistency(
  db: Db,
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  const [latestOpt] = await db
    .select({
      id: quoteOptimisationResults.id,
      status: quoteOptimisationResults.status,
      insurerAcceptedRecommendation: quoteOptimisationResults.insurerAcceptedRecommendation,
      insurerDecisionBy: quoteOptimisationResults.insurerDecisionBy,
    })
    .from(quoteOptimisationResults)
    .where(eq(quoteOptimisationResults.claimId, claim.id))
    .orderBy(quoteOptimisationResults.id)
    .limit(1);

  if (!latestOpt) {
    // Only a warning — optimisation is not mandatory for all claims
    issues.push({
      code: "NO_OPTIMISATION_RESULT",
      severity: "warning",
      field: "quoteOptimisationResults",
      message: "No AI optimisation result found for this claim.",
    });
    return;
  }

  if (latestOpt.status === "completed") {
    // Decision should be recorded
    if (latestOpt.insurerAcceptedRecommendation === null) {
      issues.push({
        code: "OPTIMISATION_DECISION_MISSING",
        severity: "warning",
        field: "insurerAcceptedRecommendation",
        message: "Optimisation is completed but insurer has not recorded a decision.",
      });
    }

    if (latestOpt.insurerAcceptedRecommendation !== null && !latestOpt.insurerDecisionBy) {
      issues.push({
        code: "DECISION_ACTOR_MISSING",
        severity: "warning",
        field: "insurerDecisionBy",
        message: "Insurer decision is recorded but insurerDecisionBy is null.",
      });
    }
  }

  if (latestOpt.status === "failed") {
    issues.push({
      code: "OPTIMISATION_FAILED",
      severity: "warning",
      field: "quoteOptimisationResults.status",
      message: "The latest AI optimisation result has status 'failed'.",
    });
  }
}

async function checkAiAssessmentConsistency(
  db: Db,
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  const [{ value: assessmentCount }] = await db
    .select({ value: count() })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claim.id));

  const statusesExpectingAssessment = new Set([
    "assessed",
    "awaiting_decision",
    "completed",
  ]);

  if (statusesExpectingAssessment.has(claim.status) && Number(assessmentCount) === 0) {
    issues.push({
      code: "NO_AI_ASSESSMENT",
      severity: "warning",
      field: "aiAssessments",
      message: `Claim is in status "${claim.status}" but has no AI assessment records.`,
    });
  }
}

async function checkTenantConsistency(
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  if (!claim.tenantId) {
    issues.push({
      code: "MISSING_TENANT_ID",
      severity: "error",
      field: "tenantId",
      message: "Claim has no tenant_id — tenant isolation cannot be enforced.",
    });
  }
}

async function checkPanelBeaterChoices(
  claim: typeof claims.$inferSelect,
  issues: IntegrityIssue[]
): Promise<void> {
  const choices = [
    claim.panelBeaterChoice1,
    claim.panelBeaterChoice2,
    claim.panelBeaterChoice3,
  ].filter(Boolean);

  if (choices.length === 0) {
    issues.push({
      code: "NO_PANEL_BEATER_CHOICES",
      severity: "info",
      field: "panelBeaterChoice1",
      message: "Claim has no panel beater choices recorded.",
    });
  }

  // Check for duplicate choices
  const unique = new Set(choices);
  if (unique.size < choices.length) {
    issues.push({
      code: "DUPLICATE_PANEL_BEATER_CHOICES",
      severity: "warning",
      field: "panelBeaterChoice1",
      message: "Claim has duplicate panel beater choices.",
    });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs all integrity checks against a single claim and returns a structured report.
 *
 * @param db   Drizzle database instance
 * @param claimId  The claim to verify
 */
export async function verifyClaimIntegrity(
  db: Db,
  claimId: number
): Promise<ClaimIntegrityReport> {
  const issues: IntegrityIssue[] = [];

  const claim = await checkClaimExists(db, claimId);

  if (!claim) {
    return {
      claimId,
      claimRef: null,
      status: null,
      tenantId: null,
      issues: [
        {
          code: "CLAIM_NOT_FOUND",
          severity: "error",
          message: `Claim ${claimId} does not exist.`,
        },
      ],
      passed: false,
      checkedAt: new Date().toISOString(),
    };
  }

  // Run all checks in parallel for performance
  await Promise.all([
    checkTenantConsistency(claim, issues),
    checkAssessorAssigned(db, claim, issues),
    checkQuotesExist(db, claim, issues),
    checkOptimisationConsistency(db, claim, issues),
    checkAiAssessmentConsistency(db, claim, issues),
    checkPanelBeaterChoices(claim, issues),
  ]);

  const passed = !issues.some((i) => i.severity === "error");

  return {
    claimId,
    claimRef: claim.claimNumber ?? null,
    status: claim.status,
    tenantId: claim.tenantId ?? null,
    issues,
    passed,
    checkedAt: new Date().toISOString(),
  };
}
