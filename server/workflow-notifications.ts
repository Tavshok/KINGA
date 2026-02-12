/**
 * Workflow Event Notifications
 * 
 * Automated email notifications for key workflow milestones:
 * - Assessor assignment
 * - Panel beater selection
 * - Quote submission
 * - Claim approval
 * - Repair completion
 */

import { notifyOwner } from "./_core/notification";
import { getDb } from "./db";
import { users, claims, panelBeaters } from "../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Send assessor assignment notification
 */
export async function notifyAssessorAssignment(params: {
  claimId: number;
  assessorId: number;
  claimNumber: string;
  claimantName: string;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get assessor details
  const [assessor] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.assessorId));

  if (!assessor?.email) return false;

  const emailContent = `
**New Claim Assignment**

Dear ${assessor.name || 'Assessor'},

You have been assigned to assess a new insurance claim.

**Claim Details:**
- Claim Number: ${params.claimNumber}
- Claimant: ${params.claimantName}
- Assignment Date: ${new Date().toLocaleString()}

**Next Steps:**
1. Review the claim details and damage photos in your dashboard
2. Schedule an inspection appointment with the claimant
3. Complete the damage assessment and cost estimation
4. Submit your evaluation report

Please log in to your KINGA dashboard to view the full claim details and begin your assessment.

**Access Your Dashboard:**
https://kinga.manus.space/assessor/dashboard

If you have any questions or need support, please contact your claims manager.

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `New Claim Assignment: ${params.claimNumber}`,
    content: emailContent,
  });
}

/**
 * Send panel beater selection notification
 */
export async function notifyPanelBeaterSelection(params: {
  claimId: number;
  panelBeaterId: number;
  claimNumber: string;
  claimantName: string;
  approvedAmount: number;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get panel beater details
  const [panelBeater] = await db
    .select()
    .from(panelBeaters)
    .where(eq(panelBeaters.id, params.panelBeaterId));

  if (!panelBeater?.email) return false;

  const emailContent = `
**Repair Assignment Notification**

Dear ${panelBeater.name},

Congratulations! Your quote has been selected for a repair assignment.

**Claim Details:**
- Claim Number: ${params.claimNumber}
- Claimant: ${params.claimantName}
- Approved Amount: R${(params.approvedAmount / 100).toFixed(2)}
- Assignment Date: ${new Date().toLocaleString()}

**Next Steps:**
1. Contact the claimant to schedule the repair
2. Confirm the repair start date
3. Complete the repair within the estimated timeframe
4. Submit completion documentation and photos

Please log in to your KINGA panel beater portal to view the full repair details and claimant contact information.

**Access Your Portal:**
https://kinga.manus.space/panel-beater/dashboard

Thank you for your partnership with KINGA AutoVerify AI.

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `Repair Assignment: ${params.claimNumber}`,
    content: emailContent,
  });
}

/**
 * Send quote submission notification
 */
export async function notifyQuoteSubmission(params: {
  claimId: number;
  panelBeaterId: number;
  claimNumber: string;
  quotedAmount: number;
  estimatedDays: number;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get claim and insurer details
  const [claim] = await db
    .select()
    .from(claims)
    .where(eq(claims.id, params.claimId));

  if (!claim) return false;

  // Get panel beater name
  const [panelBeater] = await db
    .select()
    .from(panelBeaters)
    .where(eq(panelBeaters.id, params.panelBeaterId));

  const emailContent = `
**New Quote Submission**

A new repair quote has been submitted for claim ${params.claimNumber}.

**Quote Details:**
- Panel Beater: ${panelBeater?.businessName || 'Unknown'}
- Quoted Amount: R${(params.quotedAmount / 100).toFixed(2)}
- Estimated Repair Time: ${params.estimatedDays} days
- Submission Date: ${new Date().toLocaleString()}

**Next Steps:**
The quote is now available for review in the comparison view. Once all quotes are received, you can compare and select the best option for repair assignment.

**View Quote:**
https://kinga.manus.space/insurer/claims/${params.claimId}/comparison

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `Quote Submitted: ${params.claimNumber}`,
    content: emailContent,
  });
}

/**
 * Send claim approval notification
 */
export async function notifyClaimApproval(params: {
  claimId: number;
  claimNumber: string;
  claimantId: number;
  approvedAmount: number;
  selectedPanelBeater: string;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get claimant details
  const [claimant] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.claimantId));

  if (!claimant?.email) return false;

  const emailContent = `
**Claim Approved - Repair Authorized**

Dear ${claimant.name || 'Valued Customer'},

Great news! Your insurance claim has been approved.

**Claim Details:**
- Claim Number: ${params.claimNumber}
- Approved Amount: R${(params.approvedAmount / 100).toFixed(2)}
- Selected Panel Beater: ${params.selectedPanelBeater}
- Approval Date: ${new Date().toLocaleString()}

**Next Steps:**
1. The selected panel beater will contact you shortly to schedule the repair
2. Please coordinate with them to arrange a convenient time
3. Ensure your vehicle is available for the scheduled repair period

You can track the repair progress in your KINGA claimant dashboard.

**View Claim Status:**
https://kinga.manus.space/claimant/dashboard

If you have any questions about your claim or the repair process, please don't hesitate to contact us.

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `Claim Approved: ${params.claimNumber}`,
    content: emailContent,
  });
}

/**
 * Send repair completion notification
 */
export async function notifyRepairCompletion(params: {
  claimId: number;
  claimNumber: string;
  claimantId: number;
  panelBeaterName: string;
  completionDate: Date;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get claimant details
  const [claimant] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.claimantId));

  if (!claimant?.email) return false;

  const emailContent = `
**Repair Completed - Claim Closed**

Dear ${claimant.name || 'Valued Customer'},

Your vehicle repair has been completed and your claim is now closed.

**Claim Details:**
- Claim Number: ${params.claimNumber}
- Panel Beater: ${params.panelBeaterName}
- Completion Date: ${params.completionDate.toLocaleDateString()}

**Next Steps:**
1. Inspect your vehicle to ensure you're satisfied with the repair quality
2. If you have any concerns, please contact the panel beater directly
3. Your claim documentation is available in your dashboard for your records

We hope you're satisfied with the service provided by KINGA AutoVerify AI. Your feedback is important to us.

**View Claim History:**
https://kinga.manus.space/claimant/dashboard

Thank you for choosing KINGA AutoVerify AI for your insurance claim management.

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `Repair Completed: ${params.claimNumber}`,
    content: emailContent,
  });
}

/**
 * Send claim status update notification
 */
export async function notifyClaimStatusUpdate(params: {
  claimId: number;
  claimNumber: string;
  claimantId: number;
  oldStatus: string;
  newStatus: string;
  tenantId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get claimant details
  const [claimant] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.claimantId));

  if (!claimant?.email) return false;

  // Format status for display
  const formatStatus = (status: string) => {
    return status
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const emailContent = `
**Claim Status Update**

Dear ${claimant.name || 'Valued Customer'},

The status of your insurance claim has been updated.

**Claim Details:**
- Claim Number: ${params.claimNumber}
- Previous Status: ${formatStatus(params.oldStatus)}
- New Status: ${formatStatus(params.newStatus)}
- Update Date: ${new Date().toLocaleString()}

You can view the full details and track your claim progress in your KINGA dashboard.

**View Claim:**
https://kinga.manus.space/claimant/dashboard

If you have any questions about this update, please contact your claims handler.

---
KINGA AutoVerify AI - Intelligent Claims Management
  `.trim();

  return await notifyOwner({
    title: `Claim Status Update: ${params.claimNumber}`,
    content: emailContent,
  });
}
