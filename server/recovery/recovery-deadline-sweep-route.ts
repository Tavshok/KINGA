import type { Request, Response } from "express";

import { COOKIE_NAME } from "@shared/const";
import {
  authorizeRecoveryDeadlineSweepRequest,
  type RecoverySweepAuthorizationResult,
} from "./recovery-deadline-service-authorization";

type SweepRouteDependencies = {
  environment: string;
  authorize?: (input: {
    authorization: unknown;
    hasHumanSessionCookie: boolean;
    environment: string;
  }) => Promise<RecoverySweepAuthorizationResult>;
  runSweep: () => Promise<void>;
};

function requestContainsKingaSessionCookie(request: Request): boolean {
  return String(request.headers.cookie ?? "")
    .split(";")
    .some(cookie => cookie.trim().startsWith(`${COOKIE_NAME}=`));
}

/**
 * Deliberately generic at the HTTP boundary: capability state, absence,
 * expiry, environment mismatch, and any human-session attempt reveal nothing
 * useful to an interactive caller.
 */
export function createRecoveryDeadlineSweepHandler(
  dependencies: SweepRouteDependencies
) {
  const authorize =
    dependencies.authorize ?? authorizeRecoveryDeadlineSweepRequest;

  return async (request: Request, response: Response): Promise<void> => {
    try {
      const authorization = await authorize({
        authorization: request.headers.authorization,
        hasHumanSessionCookie: requestContainsKingaSessionCookie(request),
        environment: dependencies.environment,
      });
      if (!authorization.authorized) {
        response.status(403).json({ error: "Scheduled sweep unavailable" });
        return;
      }

      await dependencies.runSweep();
      response.status(200).json({ ok: true });
    } catch {
      response.status(503).json({ error: "Scheduled sweep unavailable" });
    }
  };
}
