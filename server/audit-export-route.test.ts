import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { claims, users } from "../drizzle/schema";
import { getDb } from "./db";
import { registerAuditExportRoute } from "./audit-export-route";

type TestUser = { id: number; tenantId: string };

describe("audit export REST route authority", () => {
  const stamp = `audit-export-route-${Date.now()}`;
  const tenantA = `${stamp}-a`;
  const tenantB = `${stamp}-b`;
  let db: Awaited<ReturnType<typeof getDb>>;
  let owner: TestUser;
  let foreign: TestUser;
  let ownedClaimId: number | undefined;
  let foreignClaimId: number | undefined;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    const [ownerResult] = await db.insert(users).values({
      openId: `${stamp}-owner`,
      email: `${stamp}-owner@example.test`,
      name: "Audit Export Tenant A",
      role: "insurer",
      tenantId: tenantA,
    });
    const [foreignResult] = await db.insert(users).values({
      openId: `${stamp}-foreign`,
      email: `${stamp}-foreign@example.test`,
      name: "Audit Export Tenant B",
      role: "insurer",
      tenantId: tenantB,
    });
    owner = { id: Number(ownerResult.insertId), tenantId: tenantA };
    foreign = { id: Number(foreignResult.insertId), tenantId: tenantB };

    const [ownedClaimResult] = await db.insert(claims).values({
      claimNumber: `${stamp}-claim-a`,
      claimantId: owner.id,
      policyNumber: `${stamp}-policy-a`,
      claimantName: "Audit Export Owner",
      claimantEmail: `${stamp}-owner@example.test`,
      claimantPhone: "+263700000001",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      vehicleYear: 2020,
      vehicleRegistration: `${stamp}-a`,
      incidentDate: new Date(),
      incidentLocation: "Harare",
      incidentDescription: "Owned audit-export authority fixture",
      workflowState: "created",
      tenantId: tenantA,
    });
    const [foreignClaimResult] = await db.insert(claims).values({
      claimNumber: `${stamp}-claim-b`,
      claimantId: foreign.id,
      policyNumber: `${stamp}-policy-b`,
      claimantName: "Audit Export Foreign",
      claimantEmail: `${stamp}-foreign@example.test`,
      claimantPhone: "+263700000002",
      vehicleMake: "Honda",
      vehicleModel: "Fit",
      vehicleYear: 2021,
      vehicleRegistration: `${stamp}-b`,
      incidentDate: new Date(),
      incidentLocation: "Bulawayo",
      incidentDescription: "Foreign audit-export authority fixture",
      workflowState: "created",
      tenantId: tenantB,
    });
    ownedClaimId = Number(ownedClaimResult.insertId);
    foreignClaimId = Number(foreignClaimResult.insertId);
  });

  afterAll(async () => {
    if (!db) return;
    if (ownedClaimId) await db.delete(claims).where(eq(claims.id, ownedClaimId));
    if (foreignClaimId) await db.delete(claims).where(eq(claims.id, foreignClaimId));
    if (owner?.id) await db.delete(users).where(eq(users.id, owner.id));
    if (foreign?.id) await db.delete(users).where(eq(users.id, foreign.id));

    if (ownedClaimId) {
      expect((await db.select({ id: claims.id }).from(claims).where(eq(claims.id, ownedClaimId))).length).toBe(0);
    }
    if (foreignClaimId) {
      expect((await db.select({ id: claims.id }).from(claims).where(eq(claims.id, foreignClaimId))).length).toBe(0);
    }
  });

  async function callRoute(identity: "owner" | "foreign" | "none", claimId: number) {
    const app = express();
    const generateAuditExport = vi.fn(async (requestedClaimId: string) => ({
      payload_hash: `preserved-${requestedClaimId}`,
    }));
    registerAuditExportRoute(app, {
      authenticateRequest: async (req) => {
        const requestedIdentity = req.header("x-audit-test-identity");
        if (requestedIdentity === "owner") return owner;
        if (requestedIdentity === "foreign") return foreign;
        throw new Error("Unauthenticated fixture request");
      },
      requireGovernedTenantClaim: (await import("./services/governedClaimAuthority")).requireGovernedTenantClaim,
      generateAuditExport,
    });

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listener = app.listen(0, () => resolve(listener));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server address unavailable");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/claims/${claimId}/audit-export.json`, {
        headers: identity === "none" ? {} : { "x-audit-test-identity": identity },
      });
      return { response, generateAuditExport };
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }

  it("rejects an unauthenticated REST audit export before claim lookup or export generation", async () => {
    const { response, generateAuditExport } = await callRoute("none", ownedClaimId!);
    expect(response.status).toBe(401);
    expect(generateAuditExport).not.toHaveBeenCalled();
  });

  it("rejects a tenant-A session requesting tenant-B's claim before export generation", async () => {
    const { response, generateAuditExport } = await callRoute("owner", foreignClaimId!);
    expect(response.status).toBe(404);
    expect(generateAuditExport).not.toHaveBeenCalled();
  });

  it("allows a tenant-A session to receive the unaltered audit-export payload for tenant-A's claim", async () => {
    const { response, generateAuditExport } = await callRoute("owner", ownedClaimId!);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-payload-hash")).toBe(`preserved-${ownedClaimId}`);
    await expect(response.json()).resolves.toEqual({ payload_hash: `preserved-${ownedClaimId}` });
    expect(generateAuditExport).toHaveBeenCalledWith(String(ownedClaimId));
  });
});
