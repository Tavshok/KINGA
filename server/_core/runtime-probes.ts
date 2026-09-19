/**
 * Provider-neutral HTTP probes for staging and external deployment platforms.
 *
 * NEVER: expose secret values, query tenant data, or represent readiness as a
 * substitute for database, authority, provider, worker, or business-flow proof.
 */

import type { Express, Request, Response } from "express";
import {
  getRuntimeReadiness,
  type RuntimeReadiness,
} from "./runtime-readiness";

export type RuntimeReadinessResolver = () => RuntimeReadiness;

/**
 * Static, non-secret marker for REC-SEC deployment verification. It proves
 * that the expected backend source, rather than an earlier backend revision
 * or a cached frontend response, serves the public liveness route.
 */
export const DEPLOYMENT_PROBE_MARKER = "recsec-20260919T2054Z";

export function registerRuntimeProbes(
  app: Express,
  resolveReadiness: RuntimeReadinessResolver = getRuntimeReadiness
): void {
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({
      status: "ok",
      service: "kinga-api",
      releaseVersion: resolveReadiness().releaseVersion,
      deploymentProbe: DEPLOYMENT_PROBE_MARKER,
    });
  });

  app.get("/readyz", (_req: Request, res: Response) => {
    const readiness = resolveReadiness();
    res.status(readiness.configurationReady ? 200 : 503).json(readiness);
  });
}
