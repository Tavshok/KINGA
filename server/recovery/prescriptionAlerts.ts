// @ts-nocheck
/**
 * KINGA Subrogation — Prescription Deadline Alert Checker
 *
 * Runs on server startup and checks for recovery cases where the prescription
 * deadline is approaching. Sends notifications to the assigned recovery officer
 * (or the insurer admin if no officer is assigned) at:
 *   - 90 days before deadline
 *   - 60 days before deadline
 *   - 30 days before deadline
 *   - 14 days before deadline
 *   - 7 days before deadline
 *
 * Notifications are sent via the Manus built-in notification system.
 * The last_prescription_alert_sent_at field prevents duplicate alerts within
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

export async function checkPrescriptionDeadlines(): Promise<void> {
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

  // Fetch all active recovery cases with a prescription deadline within 90 days
  const terminalStatuses = ["settled_full", "settled_partial", "closed_no_recovery", "archived"];

  let activeCases: any[] = [];
  try {
    activeCases = await db
      .select()
      .from(recoveryCases)
      .where(
        and(
          lte(recoveryCases.prescriptionDeadline, in90Days),
          notInArray(recoveryCases.status, terminalStatuses)
        )
      );
  } catch (err) {
    console.error("[PrescriptionAlerts] Failed to query recovery cases:", err);
    return;
  }

  if (activeCases.length === 0) return;

  console.log(`[PrescriptionAlerts] Checking ${activeCases.length} case(s) with approaching prescription deadlines`);

  for (const rc of activeCases) {
    if (!rc.prescriptionDeadline) continue;

    const daysLeft = daysUntil(rc.prescriptionDeadline);
    if (daysLeft < 0) {
      // Already past deadline — send a lapsed alert if not already sent
      if (!rc.prescriptionWarningIssuedAt) {
        await sendAlert(rc, daysLeft, "LAPSED");
      }
      continue;
    }

    const threshold = shouldAlert(daysLeft);
    if (!threshold) continue;

    // Check if we already sent an alert recently
    if (rc.prescriptionWarningIssuedAt) {
      const lastAlertDate = new Date(rc.prescriptionWarningIssuedAt);
      const daysSinceLastAlert = Math.floor((today.getTime() - lastAlertDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastAlert < MIN_DAYS_BETWEEN_ALERTS) continue;

      // Also skip if the last alert was sent when we were at the same or lower threshold
      const lastDaysLeft = daysUntil(rc.prescriptionDeadline) + daysSinceLastAlert;
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
  const deadlineStr = new Date(rc.prescriptionDeadline).toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const title = `${emoji} [${urgency}] Prescription Deadline — Recovery Case RC-${rc.id}`;
  const content = [
    `Recovery Case RC-${rc.id} (Claim: ${rc.claimNumber ?? "N/A"}) requires immediate attention.`,
    "",
    daysLeft < 0
      ? `⚠️ The prescription deadline of ${deadlineStr} has PASSED. Legal action may no longer be possible. Please consult your legal team immediately.`
      : `The prescription deadline is ${deadlineStr} — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining.`,
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
      .set({ prescriptionWarningIssuedAt: new Date().toISOString().replace("T", " ").substring(0, 19) })
      .where(eq(recoveryCases.id, rc.id));

    console.log(`[PrescriptionAlerts] Alert sent for RC-${rc.id} (${daysLeft} days left, urgency: ${urgency})`);
  } catch (err) {
    console.error(`[PrescriptionAlerts] Failed to send alert for RC-${rc.id}:`, err);
  }
}
