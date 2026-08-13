export type WhatsAppSubmissionSession = {
  state: string;
  status: string;
};

export type WhatsAppTextProvider = {
  sendText(phone: string, text: string): Promise<unknown>;
};

type SubmissionResult = { claimNumber: string; idempotent: boolean };

type SubmissionSideEffectDependencies = {
  saveSession: (session: WhatsAppSubmissionSession) => Promise<unknown>;
  scheduleFollowUp?: (work: () => Promise<void>) => void;
};

const successMessage = (claimNumber: string) =>
  `✅ *Claim Submitted*\n\n` +
  `📋 Reference: *${claimNumber}*\n\n` +
  `An assessor will contact you within *24 hours* to arrange a vehicle inspection.\n\n` +
  `Reply *status* any time for an update, or view your claim at kinga.ai/client`;

const documentRequestMessage =
  `📋 *Two documents will be needed to finalise your claim:*\n\n` +
  `1️⃣ *Police report* — once issued\n` +
  `2️⃣ *Vehicle registration book* (logbook)\n\n` +
  `You can send them here on WhatsApp by replying with a photo, or upload at *kinga.ai/client*\n\n` +
  `💡 Register on the portal to track your claim and receive your assessment report → *kinga.ai/client*`;

/**
 * Sends WhatsApp confirmation only on the first committed submission session.
 * A duplicate provider delivery may still reach canonical persistence, but it
 * cannot produce a second confirmation or delayed document-request message.
 */
export async function applyWhatsAppSubmissionSideEffects(
  session: WhatsAppSubmissionSession,
  phone: string,
  provider: WhatsAppTextProvider,
  result: SubmissionResult,
  dependencies: SubmissionSideEffectDependencies,
) {
  if (session.status === "submitted" && session.state === "AWAITING_DOCS") {
    return { delivered: false, reason: "already_submitted" as const };
  }

  session.state = "AWAITING_DOCS";
  session.status = "submitted";
  await dependencies.saveSession(session);
  await provider.sendText(phone, successMessage(result.claimNumber));

  const schedule = dependencies.scheduleFollowUp ?? ((work: () => Promise<void>) => {
    setTimeout(() => { void work(); }, 3000);
  });
  schedule(async () => {
    try {
      await provider.sendText(phone, documentRequestMessage);
    } catch {
      // The claim remains submitted; follow-up delivery is retried by normal user contact.
    }
  });
  return { delivered: true, reason: result.idempotent ? "recovered_submission" as const : "new_submission" as const };
}
