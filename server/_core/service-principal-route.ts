import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ServiceCapability } from "./service-capabilities";
import type { ServiceCredentialStore } from "./service-credential-store";
import {
  authenticateServicePrincipal,
  type ServicePrincipal,
} from "./service-principal";

const FORBIDDEN_CONTEXT_HEADERS = new Set([
  "x-manus-task-uid",
  "x-workos-user-id",
  "x-workos-organization-id",
  "x-forwarded-user",
  "x-authenticated-user",
]);

export interface ServiceRouteBoundaryOptions {
  readonly expectedEnvironment: string;
  readonly requiredCapability: ServiceCapability;
  readonly store: ServiceCredentialStore;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

export type ServiceRouteHandler = (
  request: Request,
  response: Response,
  principal: ServicePrincipal,
  signal: AbortSignal
) => void | Promise<void>;

function rawHeaderValues(request: Request, name: string): string[] {
  const target = name.toLowerCase();
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === target) {
      values.push(request.rawHeaders[index + 1] ?? "");
    }
  }
  return values;
}

function hasRequestBodySignal(request: Request): boolean {
  const contentLengthValues = rawHeaderValues(request, "content-length");
  if (contentLengthValues.length > 1) return true;
  if (contentLengthValues.length === 1) {
    const value = contentLengthValues[0];
    if (!/^\d+$/u.test(value) || Number(value) !== 0) return true;
  }
  return rawHeaderValues(request, "transfer-encoding").length > 0;
}

function deny(response: Response): void {
  response.status(401).json({ error: "Unauthorized" });
}

function unavailable(response: Response): void {
  response.status(503).json({ error: "Unavailable" });
}

async function withinTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("service_authentication_timeout")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Creates a boundary intended to be registered before every body parser.
 * Package G1 deliberately exports this factory without mounting any route.
 */
export function createServicePrincipalRouteBoundary(
  options: ServiceRouteBoundaryOptions,
  handler: ServiceRouteHandler
): RequestHandler {
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("Service route timeout must be between 1 and 30000ms");
  }

  return async (request: Request, response: Response, _next: NextFunction) => {
    const authorizationValues = rawHeaderValues(request, "authorization");
    const hasCookie = rawHeaderValues(request, "cookie").length > 0;
    const hasQuery = request.originalUrl.includes("?");
    const hasBody = hasRequestBodySignal(request) || request.body !== undefined;
    const hasHumanContext = Boolean(
      (request as Request & { user?: unknown; session?: unknown }).user ||
        (request as Request & { session?: unknown }).session
    );
    const hasCronContext =
      rawHeaderValues(request, "x-manus-task-uid").length > 0;
    const hasSdkContext = request.rawHeaders.some(
      (header, index) =>
        index % 2 === 0 && FORBIDDEN_CONTEXT_HEADERS.has(header.toLowerCase())
    );

    let result;
    try {
      result = await withinTimeout(
        authenticateServicePrincipal({
          authorizationValues,
          expectedEnvironment: options.expectedEnvironment,
          requiredCapability: options.requiredCapability,
          store: options.store,
          signals: {
            hasCookie,
            hasQuery,
            hasBody,
            hasHumanContext,
            hasCronContext,
            hasSdkContext,
          },
          now: options.now?.(),
        }),
        timeoutMs
      );
    } catch {
      unavailable(response);
      return;
    }

    if (!result.ok) {
      if (result.reason === "service_unavailable") {
        unavailable(response);
        return;
      }
      deny(response);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await Promise.race([
        handler(request, response, result.principal, controller.signal),
        new Promise<never>((_resolve, reject) => {
          controller.signal.addEventListener(
            "abort",
            () => reject(new Error("service_route_timeout")),
            { once: true }
          );
        }),
      ]);
    } catch {
      if (!response.headersSent)
        response.status(503).json({ error: "Unavailable" });
    } finally {
      clearTimeout(timeout);
    }
  };
}
