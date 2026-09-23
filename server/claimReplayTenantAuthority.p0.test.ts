import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { appRouter } from "./routers";
import { historicalClaims } from "../drizzle/schema";

const routerSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/claim-replay.ts"),
  "utf8"
);
const serviceSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/services/claim-replay-comparison.ts"),
  "utf8"
);

describe("historical claim replay tenant authority", () => {
  it("requires a tenant-scoped historical claim before every claim-specific replay hold", () => {
    expect(routerSource).toContain('"A tenant-scoped session is required"');
    expect(
      routerSource.match(/requireTenantHistoricalClaim\(/g)?.length
    ).toBeGreaterThanOrEqual(5);
    expect(routerSource).toContain(
      "await requireTenantHistoricalClaim(input.historicalClaimId, tenantId)"
    );
    expect(routerSource).toContain(
      "await requireTenantHistoricalClaim(historicalClaimId, tenantId)"
    );
    const singleReplay = routerSource.slice(
      routerSource.indexOf("replayHistoricalClaim: replayProcedure"),
      routerSource.indexOf("getReplayResults: replayProcedure")
    );
    expect(
      singleReplay.indexOf("await requireTenantHistoricalClaim")
    ).toBeLessThan(singleReplay.indexOf("buildReplayP0B1Hold"));
  });

  it("retains tenant predicates in replay claim lookup version history and final claim tracking update", () => {
    expect(serviceSource).toContain(
      "replayHistoricalClaim(\n  historicalClaimId: number,\n  tenantId: string,"
    );
    expect(serviceSource).toContain("eq(historicalClaims.tenantId, tenantId)");
    expect(serviceSource).toContain(
      "eq(historicalReplayResults.tenantId, tenantId)"
    );
    expect(serviceSource).toContain(
      "storeReplayResults(\n    historicalClaimId,\n    tenantId,"
    );
  });
});

describe("historical replay P0 hold authorization ordering", () => {
  const fixtureStamp = `replay-p0-b1a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = `${fixtureStamp}-a`;
  const tenantB = `${fixtureStamp}-b`;
  const historicalClaimIds: number[] = [];
  let tenantAHistoricalClaimId = 0;
  let tenantBHistoricalClaimId = 0;

  const insertId = (result: unknown): number => {
    const value = Number(
      (result as any)[0]?.insertId ?? (result as any).insertId
    );
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error("Expected an owned historical-claim fixture ID");
    return value;
  };

  const callerFor = (tenantId: string) =>
    appRouter.createCaller({
      user: {
        id: 90301,
        openId: `replay-p0-b1a-${tenantId}`,
        name: "Replay P0-B1a Fixture",
        email: `replay-p0-b1a-${tenantId}@example.invalid`,
        role: "insurer",
        insurerRole: "claims_manager",
        tenantId,
      },
      req: {} as any,
      res: {} as any,
    } as any);

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    tenantAHistoricalClaimId = insertId(
      await db.insert(historicalClaims).values({
        tenantId: tenantA,
        claimReference: `P0-B1A-REPLAY-A-${fixtureStamp}`,
      })
    );
    tenantBHistoricalClaimId = insertId(
      await db.insert(historicalClaims).values({
        tenantId: tenantB,
        claimReference: `P0-B1A-REPLAY-B-${fixtureStamp}`,
      })
    );
    historicalClaimIds.push(tenantAHistoricalClaimId, tenantBHistoricalClaimId);
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db || historicalClaimIds.length === 0) return;
    await db
      .delete(historicalClaims)
      .where(inArray(historicalClaims.id, historicalClaimIds));
    const remaining = await db
      .select({ id: historicalClaims.id })
      .from(historicalClaims)
      .where(inArray(historicalClaims.id, historicalClaimIds));
    expect(remaining).toHaveLength(0);
  });

  it("returns the P0 hold only after an owned historical claim is resolved", async () => {
    const caller = callerFor(tenantA);
    const expectedHold = {
      status: "FRAUD_DECISION_WITHHELD",
      replayAvailable: false,
      operation: "HISTORICAL_REPLAY_WITHHELD",
      reviewRequired: true,
      actionAllowed: false,
      allowedActions: [],
    };

    await expect(
      caller.claimReplay.replayHistoricalClaim({
        historicalClaimId: tenantAHistoricalClaimId,
      })
    ).resolves.toMatchObject(expectedHold);
    await expect(
      caller.claimReplay.getReplayResults({
        historicalClaimId: tenantAHistoricalClaimId,
      })
    ).resolves.toMatchObject(expectedHold);
    await expect(
      caller.claimReplay.getLatestReplayResult({
        historicalClaimId: tenantAHistoricalClaimId,
      })
    ).resolves.toMatchObject(expectedHold);
  });

  it("rejects foreign claim IDs, including mixed batches, before returning the P0 hold", async () => {
    const caller = callerFor(tenantA);
    for (const request of [
      () =>
        caller.claimReplay.replayHistoricalClaim({
          historicalClaimId: tenantBHistoricalClaimId,
        }),
      () =>
        caller.claimReplay.getReplayResults({
          historicalClaimId: tenantBHistoricalClaimId,
        }),
      () =>
        caller.claimReplay.getLatestReplayResult({
          historicalClaimId: tenantBHistoricalClaimId,
        }),
      () =>
        caller.claimReplay.batchReplayHistoricalClaims({
          historicalClaimIds: [
            tenantAHistoricalClaimId,
            tenantBHistoricalClaimId,
          ],
        }),
    ]) {
      await expect(request()).rejects.toThrow("Historical claim not found");
    }
  });
});
