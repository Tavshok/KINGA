import type express from "express";
import { TRPCError } from "@trpc/server";
import { sdk } from "./_core/sdk";
import { AuditExportBlockedError, generateAuditExport } from "./audit-export";
import { requireGovernedTenantClaim } from "./services/governedClaimAuthority";

type AuditExportSessionUser = {
  id: number;
  tenantId?: string | null;
};

type AuditExportRouteDependencies = {
  authenticateRequest: (req: express.Request) => Promise<AuditExportSessionUser>;
  requireGovernedTenantClaim: typeof requireGovernedTenantClaim;
  generateAuditExport: typeof generateAuditExport;
};

const productionDependencies: AuditExportRouteDependencies = {
  authenticateRequest: (req) => sdk.authenticateRequest(req) as Promise<AuditExportSessionUser>,
  requireGovernedTenantClaim,
  generateAuditExport,
};

/**
 * Registers the REST alias for governed audit export.
 *
 * REST is intentionally subject to the exact same authenticated claim + tenant
 * authority check as the tRPC audit-export procedure before any exporter runs.
 */
export function registerAuditExportRoute(
  app: express.Express,
  dependencies: AuditExportRouteDependencies = productionDependencies,
): void {
  app.get("/api/claims/:claimId/audit-export.json", async (req, res) => {
    const { claimId } = req.params;
    if (!claimId || typeof claimId !== "string") {
      return res.status(400).json({ error: "Missing claimId" });
    }

    let user: AuditExportSessionUser;
    try {
      user = await dependencies.authenticateRequest(req);
    } catch {
      return res.status(401).json({ error: "Unauthorized — valid session cookie required" });
    }

    try {
      await dependencies.requireGovernedTenantClaim(claimId, user.tenantId);
    } catch (error) {
      if (error instanceof TRPCError) {
        const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 500;
        return res.status(status).json({ error: error.message });
      }
      console.error("[AuditExport] Claim authority check failed:", error);
      return res.status(500).json({ error: "Failed to authorise audit export" });
    }

    try {
      const exportData = await dependencies.generateAuditExport(claimId);
      const filename = `audit-export-${claimId}-${Date.now()}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("X-Payload-Hash", exportData.payload_hash);
      return res.status(200).send(JSON.stringify(exportData, null, 2));
    } catch (error) {
      if (error instanceof AuditExportBlockedError) {
        return res.status(422).json({
          export_allowed: false,
          reason: "Missing or inconsistent audit data",
          checks: error.checks,
        });
      }
      console.error("[AuditExport] Error generating export:", error);
      return res.status(500).json({ error: "Failed to generate audit export" });
    }
  });
}
