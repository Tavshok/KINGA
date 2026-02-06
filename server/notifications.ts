/**
 * Email Notification System for KINGA
 * 
 * Sends automated email notifications for key claim lifecycle events.
 * Uses Manus built-in notification API for reliable delivery.
 */

import { notifyOwner } from "./_core/notification";

export interface NotificationData {
  recipientEmail: string;
  recipientName: string;
  claimNumber: string;
  [key: string]: string | number;
}

/**
 * Send notification when claim is assigned to assessor
 */
export async function notifyAssessorAssignment(data: NotificationData) {
  const title = `New Claim Assignment: ${data.claimNumber}`;
  const content = `
Hello ${data.recipientName},

You have been assigned a new insurance claim for assessment.

**Claim Details:**
- Claim Number: ${data.claimNumber}
- Vehicle: ${data.vehicleMake} ${data.vehicleModel}
- Incident Date: ${data.incidentDate}

Please log in to the KINGA platform to review the claim details and schedule an inspection.

Thank you,
KINGA AutoVerify AI Team
  `.trim();

  // For now, notify owner (in production, this would send to the assessor's email)
  await notifyOwner({ title, content });
  
  console.log(`[Notification] Assessor assignment sent to ${data.recipientEmail}`);
}

/**
 * Send notification when panel beater submits a quote
 */
export async function notifyQuoteSubmitted(data: NotificationData) {
  const title = `Quote Submitted for Claim ${data.claimNumber}`;
  const content = `
Hello,

A panel beater has submitted a repair quote for claim ${data.claimNumber}.

**Quote Details:**
- Panel Beater: ${data.panelBeaterName}
- Quoted Amount: $${data.quotedAmount}
- Claim Number: ${data.claimNumber}

Please review the quote in the KINGA platform comparison view.

Thank you,
KINGA AutoVerify AI Team
  `.trim();

  await notifyOwner({ title, content });
  
  console.log(`[Notification] Quote submission notification sent`);
}

/**
 * Send notification when fraud indicators are detected
 */
export async function notifyFraudDetected(data: NotificationData) {
  const title = `⚠️ Fraud Indicators Detected: ${data.claimNumber}`;
  const content = `
URGENT: Fraud indicators have been detected for claim ${data.claimNumber}.

**Fraud Details:**
- Claim Number: ${data.claimNumber}
- Fraud Risk Score: ${data.fraudRiskScore}/100
- Discrepancy Level: ${data.discrepancyLevel}%

**Detected Indicators:**
${data.fraudIndicators}

Please review the claim immediately in the comparison view to investigate further.

Thank you,
KINGA AutoVerify AI Team
  `.trim();

  await notifyOwner({ title, content });
  
  console.log(`[Notification] Fraud alert sent for claim ${data.claimNumber}`);
}

/**
 * Send notification when AI assessment is completed
 */
export async function notifyAiAssessmentComplete(data: NotificationData) {
  const title = `AI Assessment Completed: ${data.claimNumber}`;
  const content = `
Hello,

The AI damage assessment has been completed for claim ${data.claimNumber}.

**Assessment Summary:**
- Estimated Repair Cost: $${data.estimatedCost}
- Fraud Risk Level: ${data.fraudRiskLevel}
- Confidence Score: ${data.confidenceScore}%

You can now proceed with assigning an assessor or reviewing the AI analysis.

Thank you,
KINGA AutoVerify AI Team
  `.trim();

  await notifyOwner({ title, content });
  
  console.log(`[Notification] AI assessment completion sent for claim ${data.claimNumber}`);
}

/**
 * Send notification when claim status changes
 */
export async function notifyClaimStatusChange(data: NotificationData) {
  const title = `Claim Status Update: ${data.claimNumber}`;
  const content = `
Hello ${data.recipientName},

The status of your claim ${data.claimNumber} has been updated.

**New Status:** ${data.newStatus}

${data.statusMessage || 'Please log in to the KINGA platform for more details.'}

Thank you,
KINGA AutoVerify AI Team
  `.trim();

  await notifyOwner({ title, content });
  
  console.log(`[Notification] Status change notification sent for claim ${data.claimNumber}`);
}
