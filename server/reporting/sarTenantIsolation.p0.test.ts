import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { generateReportHtml } from "./reportDefinitions";

const DB_URL = process.env.DATABASE_URL!;
const stamp = `sar_scope_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantA = `SAR_A_${stamp}`;
const tenantB = `SAR_B_${stamp}`;
let claimantId: number | undefined;
const ownedClaimIds: number[] = [];
const ownedAssessmentIds: number[] = [];

async function createConnection() {
  return mysql.createConnection(DB_URL);
}

describe("P0 SAR tenant isolation", () => {
  beforeAll(async () => {
    const conn = await createConnection();
    try {
      const [claimantResult] = await conn.execute(
        `INSERT INTO users (openId, name, email, role, tenant_id, email_verified, is_active)
         VALUES (?, ?, ?, 'claimant', ?, 1, 1)`,
        [`${stamp}_claimant`, "SAR owned claimant", `${stamp}@example.test`, tenantA],
      );
      claimantId = (claimantResult as mysql.ResultSetHeader).insertId;

      for (const [tenantId, suffix] of [[tenantA, "A1"], [tenantA, "A2"], [tenantB, "B1"]] as const) {
        const incidentType = suffix === "A1" ? "collision" : suffix === "A2" ? "theft" : "hijacking";
        const [claimResult] = await conn.execute(
          `INSERT INTO claims
            (claimant_id, claim_number, tenant_id, vehicle_make, vehicle_model, vehicle_year,
             vehicle_registration, incident_description, status, workflow_state, vehicle_vin, incident_type)
           VALUES (?, 'KNG-SAR-${stamp}-${suffix}', ?, 'Kinga', 'Scope', 2024,
                   'SAR-${suffix}', ?, 'submitted', 'created', 'VIN-${suffix}-${stamp}', ?)`,
          [claimantId, tenantId, `Owned SAR fixture ${suffix}`, incidentType],
        );
        const claimId = (claimResult as mysql.ResultSetHeader).insertId;
        ownedClaimIds.push(claimId);
        const [assessmentResult] = await conn.execute(
          `INSERT INTO ai_assessments
            (claim_id, tenant_id, damage_description, fraud_score, estimated_cost, recommendation)
           VALUES (?, ?, ?, ?, ?, 'REVIEW')`,
          [claimId, tenantId, `Owned assessment ${suffix}`, suffix === "B1" ? 99 : 11, suffix === "B1" ? 999999 : 11111],
        );
        ownedAssessmentIds.push((assessmentResult as mysql.ResultSetHeader).insertId);
      }
    } finally {
      await conn.end();
    }
  });

  afterAll(async () => {
    const conn = await createConnection();
    try {
      if (ownedAssessmentIds.length) {
        await conn.execute(`DELETE FROM ai_assessments WHERE id IN (${ownedAssessmentIds.map(() => "?").join(",")})`, ownedAssessmentIds);
      }
      if (ownedClaimIds.length) {
        await conn.execute(`DELETE FROM claims WHERE id IN (${ownedClaimIds.map(() => "?").join(",")})`, ownedClaimIds);
      }
      if (claimantId) await conn.execute("DELETE FROM users WHERE id=?", [claimantId]);

      const [remainingClaims] = ownedClaimIds.length
        ? await conn.execute(`SELECT id FROM claims WHERE id IN (${ownedClaimIds.map(() => "?").join(",")})`, ownedClaimIds)
        : [[]];
      const [remainingAssessments] = ownedAssessmentIds.length
        ? await conn.execute(`SELECT id FROM ai_assessments WHERE id IN (${ownedAssessmentIds.map(() => "?").join(",")})`, ownedAssessmentIds)
        : [[]];
      expect(remainingClaims).toEqual([]);
      expect(remainingAssessments).toEqual([]);
    } finally {
      await conn.end();
    }
  });

  it("includes every matching tenant-A claim and excludes an identical claimant's tenant-B claim with its assessment", async () => {
    const html = await generateReportHtml("governance.sar", {
      subjectId: claimantId,
      subjectType: "claimant",
      tenantId: tenantB,
    }, tenantA);

    expect(html).toContain("collision");
    expect(html).toContain("theft");
    expect(html).not.toContain("hijacking");
    expect(html).not.toContain(`VIN-B1-${stamp}`);
    expect(html).not.toContain("999999");
  });

  it("returns no data when the same claimant is requested under tenant B without a tenant-B request scope", async () => {
    const html = await generateReportHtml("governance.sar", { subjectId: claimantId, subjectType: "claimant" }, `SAR_MISSING_${stamp}`);
    expect(html).toContain("No claims data found for this subject");
    expect(html).not.toContain(`KNG-SAR-${stamp}-A1`);
    expect(html).not.toContain(`KNG-SAR-${stamp}-B1`);
  });

  it("fails closed when a direct generator invocation has no server-resolved tenant", async () => {
    await expect(generateReportHtml("governance.sar", { subjectId: claimantId, subjectType: "claimant" })).rejects.toThrow("tenant-scoped SAR request is required");
  });
});
