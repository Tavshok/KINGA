// @ts-nocheck
/**
 * KINGA Subrogation — Recovery Deadline Alert Checker
 *
 * Runs on server startup and checks for recovery cases where the recovery
 * deadline is approaching. Sends notifications to the assigned recovery officer
 * (or the insurer admin if no officer is assigned) at:
 *   - 90 days before deadline
 *   - 60 days before deadline
 *   - 30 days before deadline
 *   - 14 days before deadline
 *   - 7 days before deadline
 *
 * Notifications are sent via the Manus built-in notification system.
 * The last_recovery_deadline_alert_sent_at field prevents duplicate alerts within
 * the same threshold window.
 */

import { getDb } from "../db";
import { recoveryCases } from "../../drizzle/schema";
import { eq, and, lte, notInArray } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

// Alert thresholds in days
const ALERT_THRESHOLDS = [90, 60, 30, 14, 7];

// Minimum days between alerts for the same case (prevents re-alerting in the same window)
const MIN_DAYS_BETWEEN_ALERTS = 6;

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function shouldAlert(daysLeft: number): number | null {
  // Find the smallest threshold that is >= daysLeft
  for (const threshold of ALERT_THRESHOLDS.sort((a, b) => a - b)) {
    if (daysLeft <= threshold) return threshold;
  }
  return null;
}

function urgencyLabel(daysLeft: number): string {
  if (daysLeft <= 7) return "CRITICAL";
  if (daysLeft <= 14) return "URGENT";
  if (daysLeft <= 30) return "HIGH PRIORITY";
  return "REMINDER";
}

function urgencyEmoji(daysLeft: number): string {
  if (daysLeft <= 7) return "🚨";
  if (daysLeft <= 14) return "⚠️";
  if (daysLeft <= 30) return "📋";
  return "📅";
}

/**
 * Event-driven check for a single recovery case.
 * Call this after any status change or update to a recovery case
 * so deadline alerts are sent immediately rather than waiting for the next startup.
 */
export async function checkSingleCaseDeadline(caseId: number): Promise<void> {
  let db: any;
  try {
    db = await getDb();
    if (!db) return;
  } catch {
    return;
  }

  const terminalStatuses = ["settled_full", "settled_partial", "closed_no_recovery", "archived"];

  let rows: any[] = [];
  try {
    rows = await db
      .select()
      .from(recoveryCases)
      .where(eq(recoveryCases.id, caseId))
      .limit(1);
  } catch (err) {
    console.error(`[RecoveryDeadlineAlerts] Failed to query case ${caseId}:`, err);
    return;
  }

  if (rows.length === 0) return;
  const rc = rows[0];

  // Skip terminal cases — no point alerting on closed/settled/archived
  if (terminalStatuses.includes(rc.status)) return;
  if (!rc.recoveryDeadline) return;

  const today = new Date();
  const daysLeft = daysUntil(rc.recoveryDeadline);

  // Lapsed deadline
  if (daysLeft < 0) {
    if (!rc.recoveryDeadlineAlertSentAt) {
      await sendAlert(rc, daysLeft, "LAPSED");
    }
    return;
  }

  const threshold = shouldAlert(daysLeft);
  if (!threshold) return;

  // Avoid duplicate alerts within the same threshold window
  if (rc.recoveryDeadlineAlertSentAt) {
    const lastAlertDate = new Date(rc.recoveryDeadlineAlertSentAt);
    const daysSinceLastAlert = Math.floor((today.getTime() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLastAlert < MIN_DAYS_BETWEEN_ALERTS) return;
    const lastDaysLeft = daysLeft + daysSinceLastAlert;
    const lastThreshold = shouldAlert(lastDaysLeft);
    if (lastThreshold === threshold) return;
  }

  await sendAlert(rc, daysLeft, urgencyLabel(daysLeft));
}

export async function checkRecoveryDeadlines(): Promise<void> {
  let db: any;
  try {
    db = await getDb();
    if (!db) return;
  } catch {
    return;
  }

  const today = new Date();
  const in90Days = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  // Fetch all active recovery cases with a recovery deadline within 90 days
  const terminalStatuses = ["settled_full", "settled_partial", "closed_no_recovery", "archived"];

  let activeCases: any[] = [];
  try {
    activeCases = await db
      .select()
      .from(recoveryCases)
      .where(
        and(
          lte(recoveryCases.recoveryDeadline, in90Days),
          notInArray(recoveryCases.status, terminalStatuses)
        )
      );
  } catch (err) {
    console.error("[RecoveryDeadlineAlerts] Failed to query recovery cases:", err);
    return;
  }

  if (activeCases.length === 0) return;

  console.log(`[RecoveryDeadlineAlerts] Checking ${activeCases.length} case(s) with approaching recovery deadlines`);

  for (const rc of activeCases) {
    if (!rc.recoveryDeadline) continue;

    const daysLeft = daysUntil(rc.recoveryDeadline);
    if (daysLeft < 0) {
      // Already past deadline — send a lapsed alert if not already sent
      if (!rc.recoveryDeadlineAlertSentAt) {
        await sendAlert(rc, daysLeft, "LAPSED");
      }
      continue;
    }

    const threshold = shouldAlert(daysLeft);
    if (!threshold) continue;

    // Check if we already sent an alert recently
    if (rc.recoveryDeadlineAlertSentAt) {
      const lastAlertDate = new Date(rc.recoveryDeadlineAlertSentAt);
      const daysSinceLastAlert = Math.floor((today.getTime() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastAlert < MIN_DAYS_BETWEEN_ALERTS) continue;

      // Also skip if the last alert was sent when we were at the same or lower threshold
      const lastDaysLeft = daysUntil(rc.recoveryDeadline) + daysSinceLastAlert;
      const lastThreshold = shouldAlert(lastDaysLeft);
      if (lastThreshold === threshold) continue;
    }

    await sendAlert(rc, daysLeft, urgencyLabel(daysLeft));
  }
}

async function sendAlert(rc: any, daysLeft: number, urgency: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const emoji = daysLeft < 0 ? "🔴" : urgencyEmoji(daysLeft);
  const deadlineStr = new Date(rc.recoveryDeadline).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const title = `${emoji} [${urgency}] Recovery Deadline — Recovery Case RC-${rc.id}`;
  const content = [
    `Recovery Case RC-${rc.id} (Claim: ${rc.claimNumber ?? "N/A"}) requires immediate attention.`,
    "",
    daysLeft < 0
      ? `⚠️ The recovery deadline of ${deadlineStr} has PASSED. Legal action may no longer be possible. Please consult your legal team immediately.`
      : `The recovery deadline is ${deadlineStr} — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining.`,
    "",
    `Third Party: ${rc.thirdPartyName ?? "Unknown"}`,
    `Third-Party Insurer: ${rc.thirdPartyInsurer ?? "Unknown"}`,
    `Approved Settlement Amount: ${rc.currencyCode ?? "ZAR"} ${rc.approvedSettlementAmount ? (rc.approvedSettlementAmount / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 }) : "N/A"}`,
    `Recovery Potential Score: ${rc.recoveryPotentialScore}/100`,
    `Current Status: ${rc.status.replace(/_/g, " ")}`,
    "",
    `Action required: Log in to the KINGA Recovery Portal and update this case immediately.`,
    `Case URL: /insurer-portal/recovery/${rc.id}`,
  ].join("\n");

  try {
    await notifyOwner({ title, content });

    // Update the last alert timestamp
    await db.update(recoveryCases)
      .set({ recoveryDeadlineAlertSentAt: new Date().toISOString().replace("T", " ").substring(0, 19) })
      .where(eq(recoveryCases.id, rc.id));

    console.log(`[RecoveryDeadlineAlerts] Alert sent for RC-${rc.id} (${daysLeft} days left, urgency: ${urgency})`);
  } catch (err) {
    console.error(`[RecoveryDeadlineAlerts] Failed to send alert for RC-${rc.id}:`, err);
  }
}
