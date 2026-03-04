/**
 * Safe Email Helper — KINGA AutoVerify AI
 *
 * Wraps every outbound email send with four safety layers:
 *   1. Environment guard  — non-production sends are redirected to DEV_EMAIL_OVERRIDE
 *                           or suppressed entirely when DEV_EMAIL_OVERRIDE is unset.
 *   2. Idempotency check  — a unique key (event_type + entity_id + recipient_user_id)
 *                           is inserted into `notification_events` with a UNIQUE constraint;
 *                           duplicate sends are silently skipped.
 *   3. Rate limiting      — max 5 emails per recipient per hour, enforced via a DB count
 *                           query against `notification_events`.
 *   4. Audit log          — every attempt (sent or skipped) is recorded in
 *                           `notification_events` with a `skip_reason` when not sent.
 */

import { getDb } from "./db";
import { notificationEvents } from "../drizzle/schema";
import { and, eq, gte, count } from "drizzle-orm";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum emails a single recipient may receive within one hour. */
const RATE_LIMIT_MAX_PER_HOUR = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafeEmailOptions {
  /** Logical event type, e.g. "assessor_assignment". */
  eventType: string;
  /** Primary entity this email relates to (claim id, rfq id, etc.) — used in idempotency key. */
  entityId: string | number;
  /** Recipient's integer user id. */
  recipientUserId: number;
  /** Recipient's email address. */
  recipientEmail: string;
  /** Tenant id for multi-tenant isolation. */
  tenantId?: string;
  /** Email subject / notification title. */
  subject: string;
  /** Plain-text or markdown body. */
  body: string;
  /**
   * Optional override for the idempotency key.
   * When omitted, the key is derived as `${eventType}:${entityId}:${recipientUserId}`.
   */
  idempotencyKey?: string;
}

export type SendEmailResult =
  | { sent: true; reason?: never }
  | { sent: false; reason: "duplicate" | "rate_limited" | "dev_suppressed" | "db_unavailable" };

// ─── Core helper ──────────────────────────────────────────────────────────────

/**
 * Attempt to send a single email safely.
 *
 * Returns a discriminated union so callers can log or surface the skip reason.
 * Never throws — all errors are caught and logged to stderr.
 */
export async function sendEmailSafe(opts: SafeEmailOptions): Promise<SendEmailResult> {
  const {
    eventType,
    entityId,
    recipientUserId,
    recipientEmail,
    tenantId,
    subject,
    body,
    idempotencyKey: customKey,
  } = opts;

  const idempotencyKey = customKey ?? `${eventType}:${entityId}:${recipientUserId}`;

  try {
    const db = await getDb();
    if (!db) {
      console.error("[SafeEmail] Database unavailable — skipping send");
      return { sent: false, reason: "db_unavailable" };
    }

    // ── 1. Idempotency check ──────────────────────────────────────────────────
    // Attempt to INSERT the idempotency key. If the UNIQUE constraint fires,
    // the email was already sent and we skip.
    try {
      await db.insert(notificationEvents).values({
        eventType,
        entityId: String(entityId),
        recipientUserId,
        recipientEmail,
        tenantId: tenantId ?? null,
        idempotencyKey,
        sent: 1,
        skipReason: null,
      });
    } catch (err: unknown) {
      const isDuplicate =
        err instanceof Error &&
        (err.message.includes("Duplicate entry") ||
          err.message.includes("UNIQUE constraint") ||
          (err as NodeJS.ErrnoException).code === "ER_DUP_ENTRY");

      if (isDuplicate) {
        console.log(`[SafeEmail] Duplicate suppressed — key: ${idempotencyKey}`);
        return { sent: false, reason: "duplicate" };
      }
      // Re-throw unexpected DB errors so they surface in the outer catch
      throw err;
    }

    // ── 2. Rate limit check ───────────────────────────────────────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const [{ value: sentCount }] = await db
      .select({ value: count() })
      .from(notificationEvents)
      .where(
        and(
          eq(notificationEvents.recipientUserId, recipientUserId),
          eq(notificationEvents.sent, 1),
          gte(notificationEvents.createdAt, oneHourAgo)
        )
      );

    if (Number(sentCount) > RATE_LIMIT_MAX_PER_HOUR) {
      // Update the row we just inserted to mark it as skipped
      await db
        .update(notificationEvents)
        .set({ sent: 0, skipReason: "rate_limited" })
        .where(eq(notificationEvents.idempotencyKey, idempotencyKey));

      console.warn(
        `[SafeEmail] Rate limit exceeded for user ${recipientUserId} — skipping ${eventType}`
      );
      return { sent: false, reason: "rate_limited" };
    }

    // ── 3. Environment guard ──────────────────────────────────────────────────
    const devOverride = process.env.DEV_EMAIL_OVERRIDE;

    if (!ENV.isProduction) {
      if (!devOverride) {
        // No override configured → suppress entirely in dev/staging
        await db
          .update(notificationEvents)
          .set({ sent: 0, skipReason: "dev_suppressed" })
          .where(eq(notificationEvents.idempotencyKey, idempotencyKey));

        console.log(
          `[SafeEmail] Dev mode — email suppressed (set DEV_EMAIL_OVERRIDE to redirect). ` +
            `Would have sent "${subject}" to ${recipientEmail}`
        );
        return { sent: false, reason: "dev_suppressed" };
      }

      // Redirect to override address
      console.log(
        `[SafeEmail] Dev mode — redirecting "${subject}" from ${recipientEmail} to ${devOverride}`
      );
    }

    // ── 4. Dispatch ───────────────────────────────────────────────────────────
    const effectiveRecipient = ENV.isProduction ? recipientEmail : (devOverride as string);

    // Use the Manus built-in notification API as the delivery mechanism.
    // Replace this block with SendGrid / AWS SES / Postmark in production.
    await notifyOwner({
      title: `[${eventType}] ${subject} → ${effectiveRecipient}`,
      content: body,
    });

    console.log(
      `[SafeEmail] Sent "${subject}" to ${effectiveRecipient} (event: ${eventType}, entity: ${entityId})`
    );

    return { sent: true };
  } catch (err) {
    console.error("[SafeEmail] Unexpected error:", err);
    // Best-effort: do not throw so the caller's primary logic is never blocked
    return { sent: false, reason: "db_unavailable" };
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

/**
 * Notify an assessor about a new claim assignment.
 */
export async function sendAssessorAssignmentEmail(opts: {
  claimId: number;
  claimNumber: string;
  assessorUserId: number;
  assessorEmail: string;
  assessorName: string;
  vehicleMake: string;
  vehicleModel: string;
  incidentDate: string;
  tenantId?: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "assessor_assignment",
    entityId: opts.claimId,
    recipientUserId: opts.assessorUserId,
    recipientEmail: opts.assessorEmail,
    tenantId: opts.tenantId,
    subject: `New Claim Assignment: ${opts.claimNumber}`,
    body: `Hello ${opts.assessorName},\n\nYou have been assigned claim ${opts.claimNumber} for assessment.\n\nVehicle: ${opts.vehicleMake} ${opts.vehicleModel}\nIncident Date: ${opts.incidentDate}\n\nPlease log in to KINGA to review the details.\n\nKINGA AutoVerify AI`,
  });
}

/**
 * Notify the insurer that a panel beater has submitted a quote.
 */
export async function sendQuoteSubmittedEmail(opts: {
  claimId: number;
  claimNumber: string;
  recipientUserId: number;
  recipientEmail: string;
  panelBeaterName: string;
  quotedAmount: number;
  tenantId?: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "quote_submitted",
    entityId: opts.claimId,
    recipientUserId: opts.recipientUserId,
    recipientEmail: opts.recipientEmail,
    tenantId: opts.tenantId,
    subject: `Quote Submitted for Claim ${opts.claimNumber}`,
    body: `A quote has been submitted for claim ${opts.claimNumber}.\n\nPanel Beater: ${opts.panelBeaterName}\nAmount: R${opts.quotedAmount.toFixed(2)}\n\nLog in to KINGA to review.\n\nKINGA AutoVerify AI`,
  });
}

/**
 * Notify when AI optimisation is complete for a claim.
 */
export async function sendAiOptimisationCompleteEmail(opts: {
  claimId: number;
  claimNumber: string;
  recipientUserId: number;
  recipientEmail: string;
  riskScore: number;
  recommendedRepairer: string;
  tenantId?: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "ai_optimisation_complete",
    entityId: opts.claimId,
    recipientUserId: opts.recipientUserId,
    recipientEmail: opts.recipientEmail,
    tenantId: opts.tenantId,
    subject: `AI Optimisation Complete: ${opts.claimNumber}`,
    body: `AI optimisation has completed for claim ${opts.claimNumber}.\n\nRisk Score: ${opts.riskScore}/100\nRecommended Repairer: ${opts.recommendedRepairer}\n\nLog in to KINGA to review and make a decision.\n\nKINGA AutoVerify AI`,
  });
}

/**
 * Notify the fleet owner that an insurer has responded to their RFQ.
 */
export async function sendFleetQuoteResponseEmail(opts: {
  rfqEntityId: string;
  recipientUserId: number;
  recipientEmail: string;
  insurerName: string;
  quotedPremium: number;
  tenantId?: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "fleet_quote_response",
    entityId: opts.rfqEntityId,
    recipientUserId: opts.recipientUserId,
    recipientEmail: opts.recipientEmail,
    tenantId: opts.tenantId,
    subject: `Fleet Insurance Quote Received from ${opts.insurerName}`,
    body: `${opts.insurerName} has submitted a fleet insurance quote.\n\nQuoted Premium: R${opts.quotedPremium.toFixed(2)}\n\nLog in to KINGA Agency to compare and accept.\n\nKINGA AutoVerify AI`,
  });
}
