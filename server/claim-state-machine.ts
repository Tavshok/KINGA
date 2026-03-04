/**
 * Claim Workflow State Machine Guards — KINGA AutoVerify AI
 *
 * Centralises all PRECONDITION_FAILED guards for invalid state transitions.
 * Import and call the relevant guard at the top of each tRPC procedure.
 *
 * Guarded transitions:
 *   1. Assessment submitted before assessor is assigned
 *   2. AI optimisation run without at least one quote existing
 *   3. PDF export before optimisation is complete
 *   4. RFQ accepted twice (already accepted)
 *   5. Claim closed twice (already closed/rejected)
 */

import { TRPCError } from "@trpc/server";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../drizzle/schema";
import { eq, and, count } from "drizzle-orm";
import {
  claims,
  panelBeaterQuotes,
  quoteOptimisationResults,
  insurerQuoteRequests,
} from "../drizzle/schema";

type Db = MySql2Database<typeof schema>;

// ─── Valid terminal / closed states ──────────────────────────────────────────

const CLOSED_STATES = new Set(["completed", "rejected", "closed"]);

// ─── Guard 1: Assessment submitted before assessor assignment ─────────────────

/**
 * Throws PRECONDITION_FAILED if the claim has no assigned assessor.
 * Call this at the start of any "submit assessment" or "upload evaluation" procedure.
 */
export async function guardAssessorAssigned(db: Db, claimId: number): Promise<void> {
  const [claim] = await db
    .select({ assignedAssessorId: claims.assignedAssessorId, status: claims.status })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Claim ${claimId} not found.` });
  }

  if (!claim.assignedAssessorId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Assessment cannot be submitted before an assessor has been assigned to this claim.",
    });
  }
}

// ─── Guard 2: AI optimisation run without quotes ──────────────────────────────

/**
 * Throws PRECONDITION_FAILED if no panel beater quotes exist for the claim.
 * Call this at the start of any "run AI optimisation" procedure.
 */
export async function guardQuotesExist(db: Db, claimId: number): Promise<void> {
  const [{ value: quoteCount }] = await db
    .select({ value: count() })
    .from(panelBeaterQuotes)
    .where(eq(panelBeaterQuotes.claimId, claimId));

  if (Number(quoteCount) === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "AI optimisation cannot run until at least one panel beater quote has been submitted for this claim.",
    });
  }
}

// ─── Guard 3: PDF export before optimisation complete ────────────────────────

/**
 * Throws PRECONDITION_FAILED if no completed optimisation result exists for the claim.
 * Call this at the start of the exportClaimPDF procedure.
 */
export async function guardOptimisationComplete(db: Db, claimId: number): Promise<void> {
  const [{ value: resultCount }] = await db
    .select({ value: count() })
    .from(quoteOptimisationResults)
    .where(
      and(
        eq(quoteOptimisationResults.claimId, claimId),
        eq(quoteOptimisationResults.status, "completed")
      )
    );

  if (Number(resultCount) === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "PDF export is not available until AI optimisation has completed for this claim.",
    });
  }
}

// ─── Guard 4: RFQ accepted twice ─────────────────────────────────────────────

/**
 * Throws PRECONDITION_FAILED if the RFQ request is already in an accepted state.
 * Call this at the start of acceptOrRejectQuote when action = "accept".
 */
export async function guardRfqNotAlreadyAccepted(db: Db, rfqId: number): Promise<void> {
  const [rfq] = await db
    .select({ status: insurerQuoteRequests.status })
    .from(insurerQuoteRequests)
    .where(eq(insurerQuoteRequests.id, rfqId))
    .limit(1);

  if (!rfq) {
    throw new TRPCError({ code: "NOT_FOUND", message: `RFQ ${rfqId} not found.` });
  }

  if (rfq.status === "accepted") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This RFQ has already been accepted. Duplicate acceptance is not permitted.",
    });
  }
}

// ─── Guard 5: Claim closed twice ─────────────────────────────────────────────

/**
 * Throws PRECONDITION_FAILED if the claim is already in a terminal state.
 * Call this at the start of any "close claim" or "reject claim" procedure.
 */
export async function guardClaimNotClosed(db: Db, claimId: number): Promise<void> {
  const [claim] = await db
    .select({ status: claims.status })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);

  if (!claim) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Claim ${claimId} not found.` });
  }

  if (CLOSED_STATES.has(claim.status)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Claim is already in a terminal state (${claim.status}) and cannot be modified.`,
    });
  }
}

// ─── Composite guard: full pre-export check ──────────────────────────────────

/**
 * Convenience guard that runs both assessor-assigned and optimisation-complete
 * checks before allowing a PDF export.
 */
export async function guardPdfExportReady(db: Db, claimId: number): Promise<void> {
  await guardAssessorAssigned(db, claimId);
  await guardOptimisationComplete(db, claimId);
}
