/**
 * WhatsApp Outbound Notifications
 * ────────────────────────────────
 * Called from tRPC procedures when claim status changes.
 * Sends plain-English status updates to the client's WhatsApp number.
 */

import { getWhatsAppProvider } from "./engine";

export interface ClaimStatusNotification {
  phoneNumber: string;
  claimNumber: string;
  vehicleDescription: string;
  newStatus: string;
  additionalInfo?: string;
}

const STATUS_MESSAGES: Record<string, (n: ClaimStatusNotification) => string> = {
  in_review: (n) =>
    `🔍 *Your Claim Is Being Reviewed*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `A KINGA assessor is reviewing your claim details. You will hear from us within 24–48 hours.\n\n` +
    `Reply *status* any time for an update.`,

  ai_complete: (n) =>
    `📊 *KINGA Analysis Complete*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `KINGA has completed its analysis of your claim. Your assessor is now reviewing the results.\n\n` +
    `Reply *status* any time for an update.`,

  assessment_in_progress: (n) =>
    `🔧 *Your Claim Is Being Assessed*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `An assessor has been assigned and will contact you within 24 hours to arrange a vehicle inspection.\n\n` +
    `Reply *status* any time for an update.`,

  pending_quotes: (n) =>
    `💼 *Repair Quotes Being Collected*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `We are collecting repair quotes from approved panel beaters. This usually takes 24–48 hours.\n\n` +
    `Reply *status* any time for an update.`,

  approved: (n) =>
    `✅ *Good News — Your Claim Has Been Approved*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `${n.additionalInfo ? n.additionalInfo + "\n\n" : ""}` +
    `Please contact your panel beater to schedule repairs.\n\n` +
    `View your claim details at kinga.ai/client`,

  rejected: (n) =>
    `📋 *Update on Your Claim*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `Your claim has been reviewed and could not be approved at this time. ` +
    `You will receive a formal letter explaining the decision.\n\n` +
    `If you have questions, please contact your insurer or reply to speak with an agent.`,

  settled: (n) =>
    `💚 *Your Claim Has Been Settled*\n\n` +
    `Claim: ${n.claimNumber}\n${n.vehicleDescription}\n\n` +
    `${n.additionalInfo ? "Settlement amount: " + n.additionalInfo + "\n\n" : ""}` +
    `Payment has been processed. Please allow 3–5 business days for funds to reflect.\n\n` +
    `Thank you for choosing KINGA.`,

  quote_ready: (n) =>
    `🛡️ *Your Insurance Quote Is Ready*\n\n` +
    `${n.vehicleDescription}\n\n` +
    `${n.additionalInfo ?? "Your quote has been prepared."}\n\n` +
    `View and accept your quote at kinga.ai/client`,

  document_sent: (n) =>
    `📄 *A Document Has Been Sent to You*\n\n` +
    `${n.additionalInfo ?? "A document has been sent to your portal."}\n\n` +
    `View and download it at kinga.ai/client`,
};

/**
 * Send a WhatsApp status notification to a client.
 * Safe to call even if WhatsApp is not configured — logs and returns false.
 */
export async function notifyClientWhatsApp(
  notification: ClaimStatusNotification
): Promise<boolean> {
  try {
    const provider = getWhatsAppProvider();
    if (!provider) {
      console.log("[WA-OUT] Provider not configured — skipping WhatsApp notification");
      return false;
    }
    const messageFn = STATUS_MESSAGES[notification.newStatus];
    if (!messageFn) {
      console.log(`[WA-OUT] No template for status: ${notification.newStatus}`);
      return false;
    }
    const text = messageFn(notification);
    await provider.sendText(notification.phoneNumber, text);
    console.log(`[WA-OUT] Sent ${notification.newStatus} notification to ${notification.phoneNumber}`);
    return true;
  } catch (err) {
    console.error("[WA-OUT] Failed to send WhatsApp notification:", err);
    return false;
  }
}

