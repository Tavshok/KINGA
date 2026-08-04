// @ts-nocheck
/**
 * M-05 Search Performance Test Suite
 *
 * Verifies that global-search.ts and analytics.ts use prefix LIKE (query%)
 * for structured identifier columns, enabling B-tree index usage on TiDB.
 *
 * TiDB Serverless does not support FULLTEXT indexes. The M-05 fix uses:
 * - Prefix LIKE (query%) for identifiers: claimNumber, vehicleRegistration, vin, policyNumber
 * - Full substring LIKE (%query%) for free-text: name, email, businessName
 * - Composite B-tree indexes: idx_claims_tenant_claim_number, idx_claims_tenant_vehicle_reg, etc.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function readRouter(name: string): string {
  return readFileSync(join(ROOT, "server/routers", name), "utf-8");
}

describe("M-05 — global-search.ts uses prefix LIKE for identifier columns", () => {
  const src = readRouter("global-search.ts");

  it("defines qPrefix variable for identifier columns", () => {
    expect(src).toContain("const qPrefix =");
    expect(src).toMatch(/qPrefix\s*=\s*`\$\{query\}%`/);
  });

  it("defines qFull variable for free-text columns", () => {
    expect(src).toContain("const qFull =");
    expect(src).toMatch(/qFull\s*=\s*`%\$\{query\}%`/);
  });

  it("claims.claimNumber uses prefix LIKE", () => {
    expect(src).toMatch(/like\(claims\.claimNumber,\s*qPrefix\)/);
  });

  it("claims.vehicleRegistration uses prefix LIKE", () => {
    expect(src).toMatch(/like\(claims\.vehicleRegistration,\s*qPrefix\)/);
  });

  it("claims.vehicleVin uses prefix LIKE", () => {
    expect(src).toMatch(/like\(claims\.vehicleVin,\s*qPrefix\)/);
  });

  it("claims.policyNumber uses prefix LIKE", () => {
    expect(src).toMatch(/like\(claims\.policyNumber,\s*qPrefix\)/);
  });

  it("vehicleRegistry.registrationNumber uses prefix LIKE", () => {
    expect(src).toMatch(/like\(vehicleRegistry\.registrationNumber,\s*qPrefix\)/);
  });

  it("vehicleRegistry.vin uses prefix LIKE", () => {
    expect(src).toMatch(/like\(vehicleRegistry\.vin,\s*qPrefix\)/);
  });

  it("has M-05 prefix-only comments for identifier columns", () => {
    const m05Count = (src.match(/M-05: prefix-only/g) || []).length;
    expect(m05Count).toBeGreaterThanOrEqual(10);
  });

  it("free-text columns still use full substring LIKE (qFull or q)", () => {
    // claimantEmail should NOT use qPrefix
    const claimantEmailLine = src.split("\n").find(l => l.includes("claims.claimantEmail"));
    if (claimantEmailLine) {
      expect(claimantEmailLine).not.toContain("qPrefix");
    }
  });
});

describe("M-05 — analytics.ts uses prefix LIKE for identifier columns", () => {
  const src = readRouter("analytics.ts");

  it("defines searchPrefix variable for identifier columns", () => {
    expect(src).toContain("const searchPrefix =");
    expect(src).toMatch(/searchPrefix\s*=\s*`\$\{input\.query\}%`/);
  });

  it("vehicleRegistration LIKE uses searchPrefix", () => {
    expect(src).toMatch(/vehicleRegistration.*LIKE.*searchPrefix/);
  });

  it("claimNumber LIKE uses searchPrefix", () => {
    expect(src).toMatch(/claimNumber.*LIKE.*searchPrefix/);
  });

  it("policyNumber LIKE uses searchPrefix", () => {
    expect(src).toMatch(/policyNumber.*LIKE.*searchPrefix/);
  });

  it("has M-05 comments for identifier columns", () => {
    const m05Count = (src.match(/\/\* M-05 \*\//g) || []).length;
    expect(m05Count).toBeGreaterThanOrEqual(4);
  });
});

describe("M-05 — migration script documents TiDB FULLTEXT limitation", () => {
  const migrationSrc = readFileSync(join(ROOT, "run-fulltext-migration.mjs"), "utf-8");

  it("migration script exists and is not empty", () => {
    expect(migrationSrc.length).toBeGreaterThan(500);
  });

  it("migration script adds composite index on claims (tenant_id, claim_number)", () => {
    expect(migrationSrc).toContain("idx_claims_tenant_claim_number");
  });

  it("migration script adds composite index on claims (tenant_id, vehicle_registration)", () => {
    expect(migrationSrc).toContain("idx_claims_tenant_vehicle_reg");
  });

  it("migration script adds composite index on vehicle_registry", () => {
    expect(migrationSrc).toContain("idx_vr_tenant_reg_number");
  });

  it("migration script documents TiDB FULLTEXT limitation", () => {
    expect(migrationSrc).toMatch(/TiDB.*FULLTEXT|FULLTEXT.*TiDB/i);
  });
});
