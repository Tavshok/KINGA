/**
 * WhatsApp Provider Adapter Layer
 * ─────────────────────────────────
 * Provider-agnostic interface. Swap TwilioAdapter for MetaAdapter or
 * AfricasTalkingAdapter without changing any engine or journey code.
 */

export interface WaButton {
  id: string;
  title: string; // max 20 chars for Twilio list items
}

export interface IWhatsAppProvider {
  /** Send a plain text message */
  sendText(to: string, text: string): Promise<void>;
  /** Send a message with up to 10 quick-reply buttons */
  sendButtons(to: string, body: string, buttons: WaButton[]): Promise<void>;
  /** Send a media message (image URL) with optional caption */
  sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void>;
  /** Download media from provider CDN → return raw Buffer */
  downloadMedia(mediaUrl: string): Promise<Buffer>;
  /** Format a phone number to E.164 whatsapp: prefix */
  formatTo(phone: string): string;
}

// ─── Twilio Adapter ───────────────────────────────────────────────────────────
import twilio from "twilio";

export class TwilioAdapter implements IWhatsAppProvider {
  private client: ReturnType<typeof twilio>;
  private from: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    this.client = twilio(accountSid, authToken);
    // Ensure whatsapp: prefix
    this.from = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
  }

  formatTo(phone: string): string {
    return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
  }

  async sendText(to: string, text: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: this.formatTo(to),
      body: text,
    });
  }

  async sendButtons(to: string, body: string, buttons: WaButton[]): Promise<void> {
    // Twilio WhatsApp supports interactive list messages via Content API.
    // For sandbox compatibility, we fall back to numbered text buttons.
    const buttonText = buttons
      .map((b, i) => `${i + 1}. ${b.title}`)
      .join("\n");
    await this.sendText(to, `${body}\n\n${buttonText}`);
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    await this.client.messages.create({
      from: this.from,
      to: this.formatTo(to),
      body: caption ?? "",
      mediaUrl: [mediaUrl],
    });
  }

  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    // Twilio media URLs require basic auth
    const accountSid = (this.client as any).username as string;
    const authToken = (this.client as any).password as string;
    const resp = await fetch(mediaUrl, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
    });
    if (!resp.ok) throw new Error(`Media download failed: ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }
}

// ─── Mock Adapter (local testing without credentials) ─────────────────────────
export class MockWhatsAppAdapter implements IWhatsAppProvider {
  public sent: Array<{ to: string; type: string; body: string }> = [];

  formatTo(phone: string): string { return phone; }

  async sendText(to: string, text: string): Promise<void> {
    console.log(`[WA-MOCK] → ${to}: ${text.substring(0, 120)}`);
    this.sent.push({ to, type: "text", body: text });
  }

  async sendButtons(to: string, body: string, buttons: WaButton[]): Promise<void> {
    const btns = buttons.map(b => b.title).join(" | ");
    console.log(`[WA-MOCK] → ${to}: ${body} [${btns}]`);
    this.sent.push({ to, type: "buttons", body: `${body} [${btns}]` });
  }

  async sendMedia(to: string, mediaUrl: string, caption?: string): Promise<void> {
    console.log(`[WA-MOCK] → ${to}: [media] ${mediaUrl} ${caption ?? ""}`);
    this.sent.push({ to, type: "media", body: mediaUrl });
  }

  async downloadMedia(_mediaUrl: string): Promise<Buffer> {
    return Buffer.from("mock-image-data");
  }
}
