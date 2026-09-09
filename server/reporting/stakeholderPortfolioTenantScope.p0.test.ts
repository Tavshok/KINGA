import mysql, { type Connection } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateReportHtml } from "./reportDefinitions";

describe("DRV-007/008 — tenant-scoped stakeholder portfolio reports", () => {
  const fixtureStamp = `stakeholder-portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = `${fixtureStamp}-a`;
  const tenantB = `${fixtureStamp}-b`;
  let conn: Connection;
  let assessorAId = 0;
  let assessorBId = 0;
  let repairerAId = 0;
  let repairerBId = 0;

  const insertId = (result: unknown): number => {
    const value = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Expected an owned legacy-registry fixture ID");
    return value;
  };

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("Database not available");
    conn = await mysql.createConnection(databaseUrl);

    assessorAId = insertId(await conn.execute(
      `INSERT INTO assessor_registry
        (full_name, company_name, region, total_claims_assessed, avg_cost_reduction_pct, routing_concentration_score, risk_score, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`Assessor A ${fixtureStamp}`, "Fixture Assessors A", "Harare", 7, 12.5, 35, 42, tenantA],
    ));
    assessorBId = insertId(await conn.execute(
      `INSERT INTO assessor_registry
        (full_name, company_name, region, total_claims_assessed, avg_cost_reduction_pct, routing_concentration_score, risk_score, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [`Assessor B ${fixtureStamp}`, "Fixture Assessors B", "Bulawayo", 9, 15.5, 55, 61, tenantB],
    ));
    repairerAId = insertId(await conn.execute(
      `INSERT INTO panel_beater_registry
        (company_name, region, total_quotes_submitted, avg_quote_vs_true_cost_pct, structural_gap_count, risk_score, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`Repairer A ${fixtureStamp}`, "Harare", 11, 4.5, 2, 38, tenantA],
    ));
    repairerBId = insertId(await conn.execute(
      `INSERT INTO panel_beater_registry
        (company_name, region, total_quotes_submitted, avg_quote_vs_true_cost_pct, structural_gap_count, risk_score, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`Repairer B ${fixtureStamp}`, "Bulawayo", 13, 6.5, 3, 54, tenantB],
    ));
  });

  afterAll(async () => {
    if (!conn) return;
    if (assessorAId > 0) await conn.execute("DELETE FROM assessor_registry WHERE id = ?", [assessorAId]);
    if (assessorBId > 0) await conn.execute("DELETE FROM assessor_registry WHERE id = ?", [assessorBId]);
    if (repairerAId > 0) await conn.execute("DELETE FROM panel_beater_registry WHERE id = ?", [repairerAId]);
    if (repairerBId > 0) await conn.execute("DELETE FROM panel_beater_registry WHERE id = ?", [repairerBId]);

    const [remainingAssessors] = await conn.execute("SELECT id FROM assessor_registry WHERE id IN (?, ?)", [assessorAId, assessorBId]);
    const [remainingRepairers] = await conn.execute("SELECT id FROM panel_beater_registry WHERE id IN (?, ?)", [repairerAId, repairerBId]);
    expect(remainingAssessors).toHaveLength(0);
    expect(remainingRepairers).toHaveLength(0);
    await conn.end();
  });

  it("renders only the requesting tenant's verified assessor and panel-beater registry fields", async () => {
    const [assessorHtml, repairerHtml] = await Promise.all([
      generateReportHtml("portfolio.assessor_performance", {}, tenantA),
      generateReportHtml("portfolio.panel_beater_performance", {}, tenantA),
    ]);

    expect(assessorHtml).toContain(`Assessor A ${fixtureStamp}`);
    expect(assessorHtml).not.toContain(`Assessor B ${fixtureStamp}`);
    expect(assessorHtml).toContain("Claims (cumulative)");
    expect(assessorHtml).toContain("Registry Risk Score");
    expect(assessorHtml).toContain("Current tenant-local registry snapshot");
    expect(assessorHtml).not.toContain("Anomaly Score");

    expect(repairerHtml).toContain(`Repairer A ${fixtureStamp}`);
    expect(repairerHtml).not.toContain(`Repairer B ${fixtureStamp}`);
    expect(repairerHtml).toContain("Submitted Quotes (cumulative)");
    expect(repairerHtml).toContain("Registry Risk Score");
    expect(repairerHtml).toContain("Current tenant-local registry snapshot");
    expect(repairerHtml).not.toContain("Anomaly Score");
  });

  it("fails closed instead of generating either stakeholder report without a tenant scope", async () => {
    await expect(generateReportHtml("portfolio.assessor_performance", {})).rejects.toThrow("Tenant scope is required");
    await expect(generateReportHtml("portfolio.panel_beater_performance", {})).rejects.toThrow("Tenant scope is required");
  });
});
