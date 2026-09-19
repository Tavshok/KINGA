import type { Request, Response } from "express";

/**
 * REC-SEC-02A emergency containment. This handler intentionally grants no
 * caller, scheduler, session, network, or platform identity a success path.
 * It performs no authentication, recovery scan, notification, or data access.
 */
export function denyRecoveryDeadlineSweep(
  _request: Request,
  response: Response
): void {
  response.status(404).json({ error: "Not found" });
}
