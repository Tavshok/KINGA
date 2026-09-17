import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import twilio from "twilio";
import {
  createWhatsAppWebhookHandlers,
  type WhatsAppWebhookDependencies,
} from "./webhook";

const AUTH_TOKEN = "wa-sec-02-test-token";
const CANONICAL_URL = "https://kinga.example.test/api/whatsapp/webhook";

const configuredEnvironment: NodeJS.ProcessEnv = {
  TWILIO_ACCOUNT_SID: "ACwaSec02Test",
  TWILIO_AUTH_TOKEN: AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM: "whatsapp:+14155550123",
  TWILIO_WEBHOOK_URL: CANONICAL_URL,
};

const requestBody = {
  From: "whatsapp:+263771234567",
  Body: "I need to report a claim",
  NumMedia: "0",
  MessageSid: "SM-wa-sec-02-test",
};

type RunningWebhookTestServer = {
  baseUrl: string;
  server: Server;
};

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

async function startWebhookTestServer(
  dependencies: WhatsAppWebhookDependencies
): Promise<RunningWebhookTestServer> {
  const handlers = createWhatsAppWebhookHandlers(dependencies);
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.get("/api/whatsapp/webhook", handlers.whatsappWebhookVerify);
  app.post("/api/whatsapp/webhook", handlers.whatsappWebhookReceive);

  const server = await new Promise<Server>(resolve => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer)
    );
  });
  runningServers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server has no TCP address");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function signedHeaders(
  parameters: Record<string, string>,
  signedUrl = CANONICAL_URL
): HeadersInit {
  return {
    "content-type": "application/x-www-form-urlencoded",
    "x-twilio-signature": twilio.getExpectedTwilioSignature(
      AUTH_TOKEN,
      signedUrl,
      parameters
    ),
  };
}

function logger() {
  return { warn: vi.fn(), error: vi.fn() };
}

async function waitForAsyncMessageProcessing(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
  await new Promise<void>(resolve => setImmediate(resolve));
}

describe("WA-SEC-02 Twilio webhook signature boundary", () => {
  it("accepts a valid signed form request and passes the normalized message to the engine", async () => {
    const handleMessage = vi.fn().mockResolvedValue(undefined);
    const testLogger = logger();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: testLogger,
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: signedHeaders(requestBody),
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<Response></Response>");
    await waitForAsyncMessageProcessing();
    expect(handleMessage).toHaveBeenCalledOnce();
    expect(handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: requestBody.From,
        body: requestBody.Body,
        numMedia: 0,
      })
    );
    expect(testLogger.warn).not.toHaveBeenCalled();
  });

  it("rejects a missing signature before the engine can run", async () => {
    const handleMessage = vi.fn();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: logger(),
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("rejects a malformed signature before the engine can run", async () => {
    const handleMessage = vi.fn();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: logger(),
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "not-a-valid-twilio-signature",
      },
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(403);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("rejects a request whose form body was changed after signing", async () => {
    const handleMessage = vi.fn();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: logger(),
    });
    const changedBody = {
      ...requestBody,
      Body: "A caller changed this field after signing",
    };

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: signedHeaders(requestBody),
      body: new URLSearchParams(changedBody),
    });

    expect(response.status).toBe(403);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("fails closed when a required Twilio provider setting is absent", async () => {
    const handleMessage = vi.fn();
    const missingConfiguration = {
      ...configuredEnvironment,
      TWILIO_WHATSAPP_FROM: "",
    };
    const { baseUrl } = await startWebhookTestServer({
      environment: missingConfiguration,
      handleMessage,
      logger: logger(),
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: signedHeaders(requestBody),
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Webhook unavailable");
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("fails closed when the configured callback URL is not the exact HTTPS webhook route", async () => {
    const handleMessage = vi.fn();
    const invalidConfiguration = {
      ...configuredEnvironment,
      TWILIO_WEBHOOK_URL: "https://kinga.example.test/wrong-path",
    };
    const { baseUrl } = await startWebhookTestServer({
      environment: invalidConfiguration,
      handleMessage,
      logger: logger(),
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: signedHeaders(requestBody),
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(503);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["is empty", ""],
    ["is not HTTPS", "http://kinga.example.test/api/whatsapp/webhook"],
    [
      "contains credentials",
      "https://user:password@kinga.example.test/api/whatsapp/webhook",
    ],
    [
      "contains a query string",
      "https://kinga.example.test/api/whatsapp/webhook?unexpected=value",
    ],
    [
      "contains a fragment",
      "https://kinga.example.test/api/whatsapp/webhook#fragment",
    ],
  ])(
    "fails closed when the configured callback URL %s",
    async (_reason, webhookUrl) => {
      const handleMessage = vi.fn();
      const { baseUrl } = await startWebhookTestServer({
        environment: {
          ...configuredEnvironment,
          TWILIO_WEBHOOK_URL: webhookUrl,
        },
        handleMessage,
        logger: logger(),
      });

      const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
        method: "POST",
        headers: signedHeaders(requestBody),
        body: new URLSearchParams(requestBody),
      });

      expect(response.status).toBe(503);
      expect(handleMessage).not.toHaveBeenCalled();
    }
  );

  it("uses the configured canonical URL rather than Render-style proxy headers", async () => {
    const handleMessage = vi.fn().mockResolvedValue(undefined);
    const validateRequest = vi.fn(twilio.validateRequest);
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      validateRequest,
      logger: logger(),
    });

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        ...signedHeaders(requestBody),
        host: "internal-render-service:10000",
        "x-forwarded-host": "unexpected-proxy-host.example",
        "x-forwarded-proto": "http",
      },
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(200);
    await waitForAsyncMessageProcessing();
    expect(validateRequest).toHaveBeenCalledWith(
      AUTH_TOKEN,
      expect.any(String),
      CANONICAL_URL,
      expect.any(Object)
    );
    expect(handleMessage).toHaveBeenCalledOnce();
  });

  it("rejects a signature made for a proxy-derived URL", async () => {
    const handleMessage = vi.fn();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: logger(),
    });
    const proxyDerivedUrl =
      "http://internal-render-service:10000/api/whatsapp/webhook";

    const response = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      method: "POST",
      headers: {
        ...signedHeaders(requestBody, proxyDerivedUrl),
        host: "internal-render-service:10000",
        "x-forwarded-host": "unexpected-proxy-host.example",
        "x-forwarded-proto": "http",
      },
      body: new URLSearchParams(requestBody),
    });

    expect(response.status).toBe(403);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("rejects unexpected query parameters instead of reconstructing a different signed URL", async () => {
    const handleMessage = vi.fn();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      handleMessage,
      logger: logger(),
    });

    const response = await fetch(
      `${baseUrl}/api/whatsapp/webhook?unexpected=value`,
      {
        method: "POST",
        headers: signedHeaders(requestBody),
        body: new URLSearchParams(requestBody),
      }
    );

    expect(response.status).toBe(403);
    expect(handleMessage).not.toHaveBeenCalled();
  });

  it("applies the same signature boundary to the provider GET verification route", async () => {
    const testLogger = logger();
    const { baseUrl } = await startWebhookTestServer({
      environment: configuredEnvironment,
      logger: testLogger,
    });
    const validSignature = twilio.getExpectedTwilioSignature(
      AUTH_TOKEN,
      CANONICAL_URL,
      {}
    );

    const accepted = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
      headers: { "x-twilio-signature": validSignature },
    });
    const rejected = await fetch(`${baseUrl}/api/whatsapp/webhook`);

    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe("OK");
    expect(rejected.status).toBe(403);
    expect(testLogger.warn).toHaveBeenCalledOnce();
  });
});
