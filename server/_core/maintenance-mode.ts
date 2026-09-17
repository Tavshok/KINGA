import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Short-lived operational safety gate for controlled maintenance.
 *
 * This is intentionally fail-closed: when enabled, every request other than the
 * dedicated liveness probe receives 503 before OAuth, webhooks, uploads, routes,
 * or tRPC procedures can run. It is controlled exclusively by a server-side
 * environment variable and is not exposed to the client or persisted in the DB.
 */
export function isMaintenanceModeEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function createMaintenanceModeMiddleware(
  enabled: boolean,
  now: () => string = () => new Date().toISOString()
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled || req.path === "/healthz") {
      next();
      return;
    }

    res.status(503).json({
      error: "MAINTENANCE_IN_PROGRESS",
      message:
        "KINGA is temporarily unavailable for scheduled maintenance. Please try again shortly.",
      retryable: true,
      timestamp: now(),
    });
  };
}

/** Background write jobs must not start while the public maintenance gate is active. */
export function shouldStartMaintenanceWriteJobs(enabled: boolean): boolean {
  return !enabled;
}
