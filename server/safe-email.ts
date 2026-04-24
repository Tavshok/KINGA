/**
 * Safe Email Helper — KINGA AI
 *
 * Wraps every outbound email send with five safety layers:
 *   1. SYSTEM_TEST_MODE guard — when SYSTEM_TEST_MODE=true, all sends are suppressed,
 *                               subjects prefixed with "[TEST MODE]", and logged only.
 *   2. Environment guard      — non-production sends are redirected to DEV_EMAIL_OVERRIDE
 *                               or suppressed entirely when DEV_EMAIL_OVERRIDE is unset.
 *   3. Idempotency check      — a unique key (event_type + entity_id + recipient_user_id)
 *                               is inserted into `notification_events` with a UNIQUE constraint;
 *                               duplicate sends are silently skipped.
 *   4. 5-minute dedup window  — same event_type + recipient within the last 5 minutes is skipped.
 *   5. Hourly rate limit      — max 5 emails per recipient per hour.
 */

import { getDb } from "./db";
import { notificationEvents } from "../drizzle/schema";
import { and, eq, gte, count } from "drizzle-orm";
import { ENV } from "./_core/env";
import { notifyOwner } from "./_core/notification";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum emails a single recipient may receive within one hour. */
const RATE_LIMIT_MAX_PER_HOUR = 5;

/** Minimum gap between the same event_type + recipient (milliseconds). */
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
  | { sent: false; reason: "duplicate" | "rate_limited" | "dev_suppressed" | "test_mode_suppressed" | "dedup_window" | "db_unavailable" };

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
    body,
    idempotencyKey: customKey,
  } = opts;

  // ── 0. SYSTEM_TEST_MODE guard ─────────────────────────────────────────────
  // When SAT mode is active: prefix subject, log, and suppress dispatch entirely.
  const effectiveSubject = ENV.systemTestMode
    ? `[TEST MODE] ${opts.subject}`
    : opts.subject;

  if (ENV.systemTestMode) {
    console.log(
      `[SafeEmail][TEST MODE] Suppressed — would have sent "${effectiveSubject}" to ${recipientEmail} (event: ${eventType}, entity: ${entityId})`
    );
    // Still record in notification_events for audit purposes (skip_reason = "test_mode_suppressed")
    try {
      const db = await getDb();
      if (db) {
        const idempotencyKey = customKey ?? `${eventType}:${entityId}:${recipientUserId}:test`;
        await db.insert(notificationEvents).values({
          eventType,
          entityId: String(entityId),
          recipientUserId,
          recipientEmail,
          tenantId: tenantId ?? null,
          idempotencyKey,
          sent: 0,
          skipReason: "test_mode_suppressed",
        }).onDuplicateKeyUpdate({ set: { skipReason: "test_mode_suppressed" } });
      }
    } catch {
      // Best-effort audit log — never block
    }
    return { sent: false, reason: "test_mode_suppressed" };
  }

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

    // ── 2. 5-minute dedup window ──────────────────────────────────────────────
    // Prevent the same event_type + recipient within the last 5 minutes.
    const fiveMinutesAgo = new Date(Date.now() - DEDUP_WINDOW_MS)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const [{ value: recentCount }] = await db
      .select({ value: count() })
      .from(notificationEvents)
      .where(
        and(
          eq(notificationEvents.recipientUserId, recipientUserId),
          eq(notificationEvents.eventType, eventType),
          eq(notificationEvents.sent, 1),
          gte(notificationEvents.createdAt, fiveMinutesAgo)
        )
      );

    // recentCount includes the row we just inserted; > 1 means a prior send exists
    if (Number(recentCount) > 1) {
      await db
        .update(notificationEvents)
        .set({ sent: 0, skipReason: "dedup_window" })
        .where(eq(notificationEvents.idempotencyKey, idempotencyKey));

      console.log(
        `[SafeEmail] 5-min dedup window — skipping "${effectiveSubject}" for user ${recipientUserId} (event: ${eventType})`
      );
      return { sent: false, reason: "dedup_window" };
    }

    // ── 3. Hourly rate limit ──────────────────────────────────────────────────
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
      await db
        .update(notificationEvents)
        .set({ sent: 0, skipReason: "rate_limited" })
        .where(eq(notificationEvents.idempotencyKey, idempotencyKey));

      console.warn(
        `[SafeEmail] Rate limit exceeded for user ${recipientUserId} — skipping ${eventType}`
      );
      return { sent: false, reason: "rate_limited" };
    }

    // ── 4. Environment guard ──────────────────────────────────────────────────
    // Read DEV_EMAIL_OVERRIDE dynamically so tests can set/unset it per-case.
    const devOverride = process.env.DEV_EMAIL_OVERRIDE ?? ENV.devEmailOverride;

    if (!ENV.isProduction) {
      if (!devOverride) {
        await db
          .update(notificationEvents)
          .set({ sent: 0, skipReason: "dev_suppressed" })
          .where(eq(notificationEvents.idempotencyKey, idempotencyKey));

        console.log(
          `[SafeEmail] Dev mode — email suppressed (set DEV_EMAIL_OVERRIDE to redirect). ` +
            `Would have sent "${effectiveSubject}" to ${recipientEmail}`
        );
        return { sent: false, reason: "dev_suppressed" };
      }

      console.log(
        `[SafeEmail] Dev mode — redirecting "${effectiveSubject}" from ${recipientEmail} to ${devOverride}`
      );
    }

    // ── 5. Dispatch ───────────────────────────────────────────────────────────
    const effectiveRecipient = ENV.isProduction ? recipientEmail : devOverride;

    await notifyOwner({
      title: `[${eventType}] ${effectiveSubject} → ${effectiveRecipient}`,
      content: body,
    });

    console.log(
      `[SafeEmail] Sent "${effectiveSubject}" to ${effectiveRecipient} (event: ${eventType}, entity: ${entityId})`
    );

    return { sent: true };
  } catch (err) {
    console.error("[SafeEmail] Unexpected error:", err);
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
    body: `Hello ${opts.assessorName},\n\nYou have been assigned claim ${opts.claimNumber} for assessment.\n\nVehicle: ${opts.vehicleMake} ${opts.vehicleModel}\nIncident Date: ${opts.incidentDate}\n\nPlease log in to KINGA to review the details.\n\nKINGA AI`,
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
    body: `A quote has been submitted for claim ${opts.claimNumber}.\n\nPanel Beater: ${opts.panelBeaterName}\nAmount: R${opts.quotedAmount.toFixed(2)}\n\nLog in to KINGA to review.\n\nKINGA AI`,
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
    body: `AI optimisation has completed for claim ${opts.claimNumber}.\n\nRisk Score: ${opts.riskScore}/100\nRecommended Repairer: ${opts.recommendedRepairer}\n\nLog in to KINGA to review and make a decision.\n\nKINGA AI`,
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
    body: `${opts.insurerName} has submitted a fleet insurance quote.\n\nQuoted Premium: R${opts.quotedPremium.toFixed(2)}\n\nLog in to KINGA Agency to compare and accept.\n\nKINGA AI`,
  });
}
