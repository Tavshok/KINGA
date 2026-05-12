#!/usr/bin/env python3
"""Append fleet manager approval/rejection email helpers to safe-email.ts"""

new_code = """
/**
 * Notify a fleet manager applicant that their registration request was approved.
 */
export async function sendFleetManagerApprovedEmail(opts: {
  requestId: number;
  recipientUserId: number;
  recipientEmail: string;
  recipientName: string;
  companyName: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "fleet_manager_approved",
    entityId: opts.requestId,
    recipientUserId: opts.recipientUserId,
    recipientEmail: opts.recipientEmail,
    subject: `Fleet Manager Access Approved for ${opts.companyName}`,
    body: [
      `Hello ${opts.recipientName},`,
      ``,
      `Your fleet manager registration request for ${opts.companyName} has been approved.`,
      ``,
      `You can now log in to the KINGA platform and access the Fleet Manager Dashboard to:`,
      `  - View all claims submitted under your company name`,
      `  - Track vehicle claim history`,
      `  - Review risk analytics across your fleet`,
      ``,
      `Log in at any time to get started.`,
      ``,
      `KINGA AI Team`,
    ].join("\\n"),
  });
}

/**
 * Notify a fleet manager applicant that their registration request was rejected.
 */
export async function sendFleetManagerRejectedEmail(opts: {
  requestId: number;
  recipientUserId: number;
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  reviewNotes: string;
}): Promise<SendEmailResult> {
  return sendEmailSafe({
    eventType: "fleet_manager_rejected",
    entityId: opts.requestId,
    recipientUserId: opts.recipientUserId,
    recipientEmail: opts.recipientEmail,
    subject: `Fleet Manager Request Not Approved for ${opts.companyName}`,
    body: [
      `Hello ${opts.recipientName},`,
      ``,
      `Your fleet manager registration request for ${opts.companyName} has not been approved at this time.`,
      ``,
      `Reason provided by the reviewer: ${opts.reviewNotes}`,
      ``,
      `If you believe this is an error or would like to reapply, please contact your claims manager or submit a new request with the correct details.`,
      ``,
      `KINGA AI Team`,
    ].join("\\n"),
  });
}
"""

target = "/home/ubuntu/kinga-replit/server/safe-email.ts"

# Check it's not already there
with open(target, "r") as f:
    content = f.read()

if "sendFleetManagerApprovedEmail" in content:
    print("Already present — skipping")
else:
    with open(target, "a") as f:
        f.write(new_code)
    print("Appended successfully")
