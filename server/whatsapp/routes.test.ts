import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { Request, Response } from "express";
import { registerWhatsAppRoutes, type WhatsAppRouteHandlers } from "./routes";

const runningServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(
      server =>
        new Promise<void>((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        })
    )
  );
});

async function startRouteServer(
  handlers: WhatsAppRouteHandlers
): Promise<string> {
  const app = express();
  registerWhatsAppRoutes(app, handlers);
  const server = await new Promise<Server>(resolve => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer)
    );
  });
  runningServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server has no TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("WA-SEC-01 WhatsApp route registration", () => {
  it("does not expose the removed public test route or invoke provider handlers", async () => {
    const whatsappWebhookVerify = vi.fn(
      (_req: Request, res: Response): void => {
        res.sendStatus(204);
      }
    );
    const whatsappWebhookReceive = vi.fn(
      async (_req: Request, res: Response): Promise<void> => {
        res.sendStatus(204);
      }
    );
    const baseUrl = await startRouteServer({
      whatsappWebhookVerify,
      whatsappWebhookReceive,
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "+263771234567", body: "test" }),
    });

    expect(response.status).toBe(404);
    expect(whatsappWebhookVerify).not.toHaveBeenCalled();
    expect(whatsappWebhookReceive).not.toHaveBeenCalled();
  });

  it("continues to register the provider GET and form-encoded POST routes", async () => {
    const whatsappWebhookVerify = vi.fn(
      (_req: Request, res: Response): void => {
        res.sendStatus(204);
      }
    );
    const whatsappWebhookReceive = vi.fn(
      async (req: Request, res: Response): Promise<void> => {
        expect(req.body).toMatchObject({ From: "whatsapp:+263771234567" });
        res.sendStatus(204);
      }
    );
    const baseUrl = await startRouteServer({
      whatsappWebhookVerify,
      whatsappWebhookReceive,
    });

    const getResponse = await fetch(`${baseUrl}/api/whatsapp/webhook`);
    const postResponse = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        From: "whatsapp:+263771234567",
        Body: "Hello",
      }),
    });

    expect(getResponse.status).toBe(204);
    expect(postResponse.status).toBe(204);
    expect(whatsappWebhookVerify).toHaveBeenCalledOnce();
    expect(whatsappWebhookReceive).toHaveBeenCalledOnce();
  });
});
