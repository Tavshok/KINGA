/**
 * Platform Notification Service — Epic 5-B
 *
 * Single entry point for creating in-app notifications from any KINGA module.
 * Writes to the existing `notifications` table (per-user rows).
 * Optionally triggers email delivery via the existing sendEmailSafe infrastructure.
 * SMS is hook-ready (stub only — same pattern as existing TODO comments).
 *
 * Source modules:
 *   claims | fraud | vehicle_passport | asset_passport | engineering
 *   fleet  | timeline | recoveries | portfolio | predictive
 *
 * Priority levels (matching DB enum):
 *   low | medium | high | urgent
 */

import { getDb } from "./db";
import { notifications, notificationPreferences, users } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendEmailSafe } from "./safe-email";

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationModule =
  | "claims"
  | "fraud"
  | "vehicle_passport"
  | "asset_passport"
  | "engineering"
  | "fleet"
  | "timeline"
  | "recoveries"
  | "portfolio"
  | "predictive";

export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export type NotificationType =
  | "claim_assigned"
  | "quote_submitted"
  | "fraud_detected"
  | "status_changed"
  | "assessment_completed"
  | "approval_required"
  | "document_uploaded"
  | "system_alert";

export interface PlatformNotificationPayload {
  /** Tenant ID for isolation */
  tenantId: string;
  /** User IDs to notify */
  recipientUserIds: number[];
  /** Source module */
  module: NotificationModule;
  /** Notification type (maps to existing DB enum) */
  type: NotificationType;
  /** Short title */
  title: string;
  /** Full message body */
  message: string;
  /** Priority level */
  priority?: NotificationPriority;
  /** Optional claim ID for deep-link */
  claimId?: number;
  /** Entity type for deep-link (e.g. "vehicle", "asset", "fleet") */
  entityType?: string;
  /** Entity ID for deep-link */
  entityId?: number;
  /** Full deep-link URL */
  actionUrl?: string;
}

// ─── Default preferences (applied when no row exists for user+module) ────────

const DEFAULT_IN_APP = true;
const DEFAULT_EMAIL = false;

// ─── Core function ───────────────────────────────────────────────────────────

/**
 * Create platform notifications for a list of recipients.
 *
 * For each recipient:
 * 1. Checks their notification_preferences for this module.
 * 2. Skips if in_app_enabled = 0 or priority < min_priority.
 * 3. Inserts a row into the notifications table.
 * 4. Triggers email if email_enabled = 1.
 * 5. SMS hook (stub — not yet wired to a provider).
 *
 * @returns number of notifications actually inserted
 */
export async function createPlatformNotification(
  payload: PlatformNotificationPayload
): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[PlatformNotification] Database not available — skipping notification");
    return 0;
  }

  const priority = payload.priority ?? "medium";
  const PRIORITY_ORDER: Record<NotificationPriority, number> = {
    low: 0,
    medium: 1,
    high: 2,
    urgent: 3,
  };

  let inserted = 0;

  for (const userId of payload.recipientUserIds) {
    try {
      // ── 1. Fetch user preferences for this module ──────────────────────
      const [pref] = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.tenantId, payload.tenantId),
            eq(notificationPreferences.module, payload.module)
          )
        )
        .limit(1);

      const inAppEnabled = pref ? pref.inAppEnabled === 1 : DEFAULT_IN_APP;
      const emailEnabled = pref ? pref.emailEnabled === 1 : DEFAULT_EMAIL;
      const minPriority = (pref?.minPriority as NotificationPriority) ?? "low";

      // ── 2. Priority gate ───────────────────────────────────────────────
      if (PRIORITY_ORDER[priority] < PRIORITY_ORDER[minPriority]) {
        continue; // below user's threshold — skip silently
      }

      // ── 3. In-app notification ─────────────────────────────────────────
      if (inAppEnabled) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.insert(notifications) as any).values({
          userId,
          title: payload.title,
          message: payload.message,
          type: payload.type,
          claimId: payload.claimId ?? null,
          entityType: payload.entityType ?? payload.module,
          entityId: payload.entityId ?? null,
          isRead: 0,
          actionUrl: payload.actionUrl ?? null,
          priority,
          // New columns added in Epic 5-B migration (ALTER TABLE, not in generated schema types)
          module: payload.module,
          tenantId: payload.tenantId,
        });
        inserted++;
      }

      // ── 4. Email hook ──────────────────────────────────────────────────
      if (emailEnabled) {
        try {
          const [userRow] = await db
            .select({ email: users.email, name: users.name })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (userRow?.email) {
            await sendEmailSafe({
              eventType: `platform_notification_${payload.module}` as any,
              entityId: payload.claimId ?? payload.entityId ?? 0,
              recipientUserId: userId,
              recipientEmail: userRow.email,
              subject: payload.title,
              body: `Hello ${userRow.name ?? ""},\n\n${payload.message}\n\nKINGA Platform`,
            });
          }
        } catch (emailErr) {
          // Non-fatal — log and continue
          console.warn(`[PlatformNotification] Email failed for user ${userId}:`, emailErr);
        }
      }

      // ── 5. SMS hook (stub) ─────────────────────────────────────────────
      // const smsEnabled = pref ? pref.smsEnabled === 1 : false;
      // if (smsEnabled) {
      //   await sendSms({ userId, message: payload.message });
      // }
    } catch (err) {
      console.error(`[PlatformNotification] Failed for user ${userId}:`, err);
    }
  }

  return inserted;
}

// ─── Convenience wrappers per module ────────────────────────────────────────

export const notifyClaimsEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "claims" });

export const notifyFraudEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "fraud" });

export const notifyVehiclePassportEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "vehicle_passport" });

export const notifyAssetPassportEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "asset_passport" });

export const notifyEngineeringEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "engineering" });

export const notifyFleetEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "fleet" });

export const notifyTimelineEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "timeline" });

export const notifyRecoveriesEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "recoveries" });

export const notifyPortfolioEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "portfolio" });

export const notifyPredictiveEvent = (
  base: Omit<PlatformNotificationPayload, "module">
) => createPlatformNotification({ ...base, module: "predictive" });
