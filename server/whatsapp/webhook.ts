/**
 * WhatsApp Webhook — Express Route Handler
 * ─────────────────────────────────────────
 * Handles both GET (Twilio webhook verification) and POST (inbound messages).
 * Provider-agnostic: normalises Twilio payload to IncomingMessage format.
 */

import type { Request, Response } from "express";
import { handleIncomingMessage } from "./engine";
import type { IncomingMessage } from "./types";

/** GET /api/whatsapp/webhook — Twilio sends a GET to verify the webhook URL */
export function whatsappWebhookVerify(req: Request, res: Response): void {
  // Twilio doesn't require a challenge like Meta does — just return 200
  res.status(200).send("OK");
}

/** POST /api/whatsapp/webhook — Inbound message from Twilio */
export async function whatsappWebhookReceive(req: Request, res: Response): Promise<void> {
  try {
    // Twilio sends form-encoded body
    const body = req.body as Record<string, string>;

    const msg: IncomingMessage = {
      from: body.From ?? "",                          // e.g. whatsapp:+263771234567
      body: body.Body ?? "",
      mediaUrl: body.MediaUrl0 ?? undefined,
      mediaType: body.MediaContentType0 ?? undefined,
      numMedia: parseInt(body.NumMedia ?? "0", 10),
    };

    // Handle location messages (Twilio sends lat/long as separate fields)
    if (body.Latitude && body.Longitude) {
      msg.latitude = parseFloat(body.Latitude);
      msg.longitude = parseFloat(body.Longitude);
      msg.locationAddress = body.Label ?? body.Address ?? undefined;
    }

    // Respond to Twilio immediately (must respond within 5s)
    res.status(200).send("<Response></Response>");

    // Process asynchronously
    setImmediate(async () => {
      try {
        await handleIncomingMessage(msg);
      } catch (err) {
        console.error("[WA-WEBHOOK] Message processing error:", err);
      }
    });
  } catch (err) {
    console.error("[WA-WEBHOOK] Webhook error:", err);
    res.status(500).send("Error");
  }
}

/** POST /api/whatsapp/test — Local testing endpoint (no Twilio required) */
export async function whatsappTestEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const { from, body, mediaUrl, mediaType, latitude, longitude } = req.body as Record<string, string>;
    const msg: IncomingMessage = {
      from: from ?? "+263771234567",
      body: body ?? "",
      mediaUrl: mediaUrl ?? undefined,
      mediaType: mediaType ?? undefined,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
    };
    await handleIncomingMessage(msg);
    res.json({ ok: true, processed: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

