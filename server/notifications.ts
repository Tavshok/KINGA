// @ts-nocheck
/**
 * Email Notification System for KINGA
 * 
 * Sends automated email notifications for key claim lifecycle events.
 * Uses Manus built-in notification API for reliable delivery.
 */

/**
 * All sends are now routed through sendEmailSafe which enforces idempotency,
 * environment guard, rate limiting, and audit logging via notification_events.
 */
import { sendEmailSafe } from "./safe-email";

export interface NotificationData {
  recipientEmail: string;
  recipientName: string;
  claimNumber: string;
  [key: string]: string | number;
}

/**
 * Send notification when claim is assigned to assessor
 */
export async function notifyAssessorAssignment(data: NotificationData & { claimId: number; recipientUserId?: number }) {
  await sendEmailSafe({
    eventType: "assessor_assignment",
    entityId: data.claimId,
    recipientUserId: data.recipientUserId ?? 0,
    recipientEmail: data.recipientEmail,
    subject: `New Claim Assignment: ${data.claimNumber}`,
    body: `Hello ${data.recipientName},\n\nYou have been assigned a new insurance claim for assessment.\n\nClaim Number: ${data.claimNumber}\nVehicle: ${data.vehicleMake} ${data.vehicleModel}\nIncident Date: ${data.incidentDate}\n\nPlease log in to the KINGA platform to review the claim details and schedule an inspection.\n\nKINGA AutoVerify AI Team`,
  });
}

/**
 * Send notification when panel beater submits a quote
 */
export async function notifyQuoteSubmitted(data: NotificationData & { claimId: number; recipientUserId?: number }) {
  await sendEmailSafe({
    eventType: "quote_submitted",
    entityId: data.claimId,
    recipientUserId: data.recipientUserId ?? 0,
    recipientEmail: data.recipientEmail,
    subject: `Quote Submitted for Claim ${data.claimNumber}`,
    body: `Hello,\n\nA panel beater has submitted a repair quote for claim ${data.claimNumber}.\n\nPanel Beater: ${data.panelBeaterName}\nQuoted Amount: R${data.quotedAmount}\n\nPlease review the quote in the KINGA platform comparison view.\n\nKINGA AutoVerify AI Team`,
  });
}

/**
 * Send notification when fraud indicators are detected
 */
export async function notifyFraudDetected(data: NotificationData & { claimId: number; recipientUserId?: number }) {
  await sendEmailSafe({
    eventType: "fraud_detected",
    entityId: data.claimId,
    recipientUserId: data.recipientUserId ?? 0,
    recipientEmail: data.recipientEmail,
    subject: `⚠️ Fraud Indicators Detected: ${data.claimNumber}`,
    body: `URGENT: Fraud indicators detected for claim ${data.claimNumber}.\n\nFraud Risk Score: ${data.fraudRiskScore}/100\nDiscrepancy Level: ${data.discrepancyLevel}%\n\nDetected Indicators:\n${data.fraudIndicators}\n\nPlease review the claim immediately.\n\nKINGA AutoVerify AI Team`,
  });
}

/**
 * Send notification when AI assessment is completed
 */
export async function notifyAiAssessmentComplete(data: NotificationData & { claimId: number; recipientUserId?: number }) {
  await sendEmailSafe({
    eventType: "ai_assessment_complete",
    entityId: data.claimId,
    recipientUserId: data.recipientUserId ?? 0,
    recipientEmail: data.recipientEmail,
    subject: `AI Assessment Completed: ${data.claimNumber}`,
    body: `Hello,\n\nThe AI damage assessment has been completed for claim ${data.claimNumber}.\n\nEstimated Repair Cost: R${data.estimatedCost}\nFraud Risk Level: ${data.fraudRiskLevel}\nConfidence Score: ${data.confidenceScore}%\n\nYou can now proceed with assigning an assessor or reviewing the AI analysis.\n\nKINGA AutoVerify AI Team`,
  });
}

/**
 * Send notification when claim status changes
 */
export async function notifyClaimStatusChange(data: NotificationData & { claimId: number; recipientUserId?: number }) {
  await sendEmailSafe({
    eventType: "status_change",
    entityId: data.claimId,
    recipientUserId: data.recipientUserId ?? 0,
    recipientEmail: data.recipientEmail,
    subject: `Claim Status Update: ${data.claimNumber}`,
    body: `Hello ${data.recipientName},\n\nThe status of your claim ${data.claimNumber} has been updated.\n\nNew Status: ${data.newStatus}\n${data.statusMessage || "Please log in to the KINGA platform for more details."}\n\nKINGA AutoVerify AI Team`,
  });
}
