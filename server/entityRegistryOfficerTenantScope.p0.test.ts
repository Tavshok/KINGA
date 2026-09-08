import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { checkOfficerConcentration, processEntityRegistry } from "./services/entityRegistry";

describe("DRV-005 police officer badge tenant scope", () => {
  let tenantA = "";
  let tenantB = "";
  let badge = "";
  let claimIds: number[] = [];
  let connection: mysql.Connection;

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tenantA = `test-drv005-a-${stamp}`;
    tenantB = `test-drv005-b-${stamp}`;
    badge = `DRV005-${stamp}`;
    connection = await mysql.createConnection({ uri: process.env.DATABASE_URL! });
    const claimNumbers = [1, 2, 3, 4].map((sequence) => `DRV005-${stamp}-${sequence}`);
    await connection.execute("INSERT INTO claims (claim_number, tenant_id, status) VALUES (?, ?, 'submitted'), (?, ?, 'submitted'), (?, ?, 'submitted'), (?, ?, 'submitted')", [claimNumbers[0], tenantA, claimNumbers[1], tenantA, claimNumbers[2], tenantA, claimNumbers[3], tenantB]);
    const [claims] = await connection.execute<any[]>("SELECT id, claim_number FROM claims WHERE claim_number IN (?, ?, ?, ?)", claimNumbers);
    claimIds = claimNumbers.map((claimNumber) => claims.find((claim) => claim.claim_number === claimNumber)?.id).filter(Boolean);
    if (claimIds.length !== 4) throw new Error("DRV-005 fixture claims were not created");
    for (const claimId of claimIds.slice(0, 3)) {
      await processEntityRegistry({ claimId, tenantId: tenantA, officerName: "Officer Fixture", officerBadgeNumber: badge, assessorName: "Assessor A" });
    }
    await processEntityRegistry({ claimId: claimIds[3], tenantId: tenantB, officerName: "Officer Fixture", officerBadgeNumber: badge, assessorName: "Assessor B" });
  });

  afterAll(async () => {
    if (connection && tenantA && tenantB) {
      await connection.execute("DELETE FROM police_officer_registry WHERE tenant_id IN (?, ?)", [tenantA, tenantB]);
      if (claimIds.length) await connection.execute("DELETE FROM claim_features WHERE claim_id IN (?, ?, ?, ?)", claimIds);
      if (claimIds.length) await connection.execute("DELETE FROM entity_relationship_graph WHERE claim_id IN (?, ?, ?, ?)", claimIds);
      if (claimIds.length) await connection.execute("DELETE FROM claims WHERE id IN (?, ?, ?, ?)", claimIds);
      await connection.end();
    }
  });

  it("keeps same-badge concentration and updates within the requesting tenant", async () => {
    const [a, b] = await Promise.all([
      checkOfficerConcentration("Officer Fixture", badge, tenantA),
      checkOfficerConcentration("Officer Fixture", badge, tenantB),
    ]);
    expect(a).toMatchObject({ totalClaims: 3, riskLevel: "advisory", topAssessorCount: 3, collusionWebDetected: true });
    expect(b).toMatchObject({ totalClaims: 1, riskLevel: "none", topAssessorCount: 1, collusionWebDetected: false });
    const [rows] = await connection.execute<any[]>("SELECT tenant_id, total_claims FROM police_officer_registry WHERE badge_number = ? AND tenant_id IN (?, ?) ORDER BY tenant_id", [badge, tenantA, tenantB]);
    expect(rows).toEqual(expect.arrayContaining([{ tenant_id: tenantA, total_claims: 3 }, { tenant_id: tenantB, total_claims: 1 }]));
  });

  it("fails closed when no tenant is available", async () => {
    await expect(checkOfficerConcentration("Officer Fixture", badge, undefined)).resolves.toBeNull();
  });
});
