import express, { type Express, type RequestHandler } from "express";
import {
  whatsappWebhookReceive,
  whatsappWebhookVerify,
  type WhatsAppWebhookHandlers,
} from "./webhook";

export type WhatsAppRouteHandlers = Pick<
  WhatsAppWebhookHandlers,
  "whatsappWebhookVerify" | "whatsappWebhookReceive"
>;

const productionHandlers: WhatsAppRouteHandlers = {
  whatsappWebhookVerify,
  whatsappWebhookReceive,
};

/**
 * Registers only the authenticated provider webhook routes. Deliberately keep
 * local test simulation outside the HTTP surface; engine tests exercise it
 * with controlled dependencies instead.
 */
export function registerWhatsAppRoutes(
  app: Express,
  handlers: WhatsAppRouteHandlers = productionHandlers
): void {
  app.get(
    "/api/whatsapp/webhook",
    handlers.whatsappWebhookVerify as RequestHandler
  );
  app.post(
    "/api/whatsapp/webhook",
    express.urlencoded({ extended: true, limit: "5mb" }),
    handlers.whatsappWebhookReceive as RequestHandler
  );
}
