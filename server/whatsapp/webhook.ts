/**
 * WhatsApp Webhook — Express Route Handler
 * ─────────────────────────────────────────
 * Handles provider verification and inbound messages. Provider requests must be
 * authenticated before the intake engine can run.
 */
import type { Request, Response } from "express";
import twilio from "twilio";
import { handleIncomingMessage } from "./engine";
import type { IncomingMessage } from "./types";

const WEBHOOK_PATH = "/api/whatsapp/webhook";
const FORBIDDEN_RESPONSE = "Forbidden";
const UNAVAILABLE_RESPONSE = "Webhook unavailable";

type FormParameters = Record<string, unknown>;

type WebhookConfiguration = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  canonicalUrl: string;
};

export type WhatsAppWebhookDependencies = {
  environment?: NodeJS.ProcessEnv;
  validateRequest?: typeof twilio.validateRequest;
  handleMessage?: typeof handleIncomingMessage;
  logger?: Pick<Console, "warn" | "error">;
};

export type WhatsAppWebhookHandlers = {
  whatsappWebhookVerify: (req: Request, res: Response) => void;
  whatsappWebhookReceive: (req: Request, res: Response) => Promise<void>;
};

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  key: string
): string | null {
  const value = environment[key]?.trim();
  return value ? value : null;
}

function configuredWebhookUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== WEBHOOK_PATH ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function getWebhookConfiguration(
  environment: NodeJS.ProcessEnv
): WebhookConfiguration | null {
  const accountSid = requiredEnvironmentValue(
    environment,
    "TWILIO_ACCOUNT_SID"
  );
  const authToken = requiredEnvironmentValue(environment, "TWILIO_AUTH_TOKEN");
  const fromNumber = requiredEnvironmentValue(
    environment,
    "TWILIO_WHATSAPP_FROM"
  );
  const configuredUrl = requiredEnvironmentValue(
    environment,
    "TWILIO_WEBHOOK_URL"
  );
  const canonicalUrl = configuredUrl
    ? configuredWebhookUrl(configuredUrl)
    : null;

  if (!accountSid || !authToken || !fromNumber || !canonicalUrl) return null;

  return { accountSid, authToken, fromNumber, canonicalUrl };
}

function formParameters(body: unknown): FormParameters {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body as FormParameters;
}

function hasQueryParameters(req: Request): boolean {
  return req.originalUrl.includes("?");
}

function rejectForbidden(
  res: Response,
  logger: Pick<Console, "warn" | "error">,
  reason: string
): false {
  logger.warn(`[WA-WEBHOOK] Provider request rejected: ${reason}`);
  res.status(403).type("text/plain").send(FORBIDDEN_RESPONSE);
  return false;
}

function validateProviderRequest(
  req: Request,
  res: Response,
  dependencies: Required<
    Pick<
      WhatsAppWebhookDependencies,
      "environment" | "validateRequest" | "logger"
    >
  >
): boolean {
  const configuration = getWebhookConfiguration(dependencies.environment);
  if (!configuration) {
    dependencies.logger.error(
      "[WA-WEBHOOK] Provider request rejected: configuration unavailable"
    );
    res.status(503).type("text/plain").send(UNAVAILABLE_RESPONSE);
    return false;
  }

  // The configured external URL, rather than proxy-derived request headers, is
  // the sole signature URL. Render terminates TLS before the Node process.
  if (hasQueryParameters(req)) {
    return rejectForbidden(
      res,
      dependencies.logger,
      "unexpected query parameters"
    );
  }

  const signature = req.get("X-Twilio-Signature");
  if (!signature)
    return rejectForbidden(res, dependencies.logger, "signature absent");

  const parameters = req.method === "POST" ? formParameters(req.body) : {};
  let signatureIsValid = false;
  try {
    signatureIsValid = dependencies.validateRequest(
      configuration.authToken,
      signature,
      configuration.canonicalUrl,
      parameters
    );
  } catch {
    return rejectForbidden(
      res,
      dependencies.logger,
      "signature validation error"
    );
  }

  if (!signatureIsValid)
    return rejectForbidden(res, dependencies.logger, "signature invalid");
  return true;
}

function incomingMessageFromForm(body: FormParameters): IncomingMessage {
  const value = (key: string): string | undefined => {
    const parameter = body[key];
    return typeof parameter === "string" ? parameter : undefined;
  };

  const msg: IncomingMessage = {
    from: value("From") ?? "", // e.g. whatsapp:+263771234567
    body: value("Body") ?? "",
    mediaUrl: value("MediaUrl0"),
    mediaType: value("MediaContentType0"),
    numMedia: parseInt(value("NumMedia") ?? "0", 10),
  };

  const latitude = value("Latitude");
  const longitude = value("Longitude");
  if (latitude && longitude) {
    msg.latitude = parseFloat(latitude);
    msg.longitude = parseFloat(longitude);
    msg.locationAddress = value("Label") ?? value("Address");
  }

  return msg;
}

/**
 * Creates authenticated provider-webhook handlers. Dependency injection is
 * limited to tests; the production exports below use the actual environment,
 * Twilio SDK validator, intake engine, and console.
 */
export function createWhatsAppWebhookHandlers(
  dependencies: WhatsAppWebhookDependencies = {}
): WhatsAppWebhookHandlers {
  const resolvedDependencies: Required<WhatsAppWebhookDependencies> = {
    environment: dependencies.environment ?? process.env,
    validateRequest: dependencies.validateRequest ?? twilio.validateRequest,
    handleMessage: dependencies.handleMessage ?? handleIncomingMessage,
    logger: dependencies.logger ?? console,
  };

  return {
    whatsappWebhookVerify(req: Request, res: Response): void {
      if (!validateProviderRequest(req, res, resolvedDependencies)) return;
      // Twilio's GET verification needs only a successful response after auth.
      res.status(200).send("OK");
    },

    async whatsappWebhookReceive(req: Request, res: Response): Promise<void> {
      if (!validateProviderRequest(req, res, resolvedDependencies)) return;

      try {
        const msg = incomingMessageFromForm(formParameters(req.body));
        // Respond within the provider's deadline, then process asynchronously.
        res.status(200).send("<Response></Response>");
        setImmediate(async () => {
          try {
            await resolvedDependencies.handleMessage(msg);
          } catch {
            resolvedDependencies.logger.error(
              "[WA-WEBHOOK] Message processing failed"
            );
          }
        });
      } catch {
        resolvedDependencies.logger.error(
          "[WA-WEBHOOK] Message normalization failed"
        );
        if (!res.headersSent) res.status(500).send("Error");
      }
    },
  };
}

const productionHandlers = createWhatsAppWebhookHandlers();

/** GET /api/whatsapp/webhook — signed provider verification request. */
export const whatsappWebhookVerify = productionHandlers.whatsappWebhookVerify;

/** POST /api/whatsapp/webhook — signed inbound provider message. */
export const whatsappWebhookReceive = productionHandlers.whatsappWebhookReceive;

/** POST /api/whatsapp/test — Local testing endpoint (no Twilio required). */
export async function whatsappTestEndpoint(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { from, body, mediaUrl, mediaType, latitude, longitude } =
      req.body as Record<string, string>;
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
  } catch (err: unknown) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
