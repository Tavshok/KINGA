// @ts-nocheck
/**
 * M-05 Search Performance Test Suite
 *
 * TiDB Serverless does not support FULLTEXT indexes. The M-05 work:
 * - Keeps substring LIKE ('%query%') for all search columns — mid-string search is required
 *   because KINGA's WhatsApp-first claim intake means assessors/panel beaters frequently
 *   work from partial identifiers (last digits of plate, partial VIN from photo).
 * - Added 4 composite B-tree indexes for tenant-scoped exact/prefix lookups.
 * - Documents KINGA-SEARCH-01 as a carried-forward item: at 10k+ claims, a proper search
 *   service (external index) will be needed to avoid full-table scans.
 *
 * M-01 routers.ts fixes also verified here:
 * - L541: assessorSubscriptions .limit(200)
 * - L9395: pendingQuotes .limit(500)
 * - L9478: insuranceQuotes by customerId .limit(100)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

function readRouter(name: string): string {
  return readFileSync(join(ROOT, "server/routers", name), "utf-8");
}

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("M-05 — global-search.ts uses substring LIKE (%query%) for all columns", () => {
  const src = readRouter("global-search.ts");

  it("defines q variable as substring pattern (%query%)", () => {
    expect(src).toContain("const q =");
    expect(src).toMatch(/const q\s*=\s*`%\$\{query\}%`/);
  });

  it("does NOT define qPrefix (prefix-only search was reverted)", () => {
    expect(src).not.toContain("qPrefix");
  });

  it("does NOT define qFull (simplified to single q variable)", () => {
    expect(src).not.toContain("qFull");
  });

  it("claims.claimNumber uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(claims\.claimNumber,\s*q\)/);
  });

  it("claims.vehicleRegistration uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(claims\.vehicleRegistration,\s*q\)/);
  });

  it("claims.vehicleVin uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(claims\.vehicleVin,\s*q\)/);
  });

  it("claims.policyNumber uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(claims\.policyNumber,\s*q\)/);
  });

  it("vehicleRegistry.registrationNumber uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(vehicleRegistry\.registrationNumber,\s*q\)/);
  });

  it("vehicleRegistry.vin uses substring LIKE (q)", () => {
    expect(src).toMatch(/like\(vehicleRegistry\.vin,\s*q\)/);
  });

  it("documents TiDB FULLTEXT limitation and KINGA-SEARCH-01 carried-forward item", () => {
    expect(src).toContain("KINGA-SEARCH-01");
    expect(src).toMatch(/TiDB.*FULLTEXT|FULLTEXT.*TiDB/i);
  });
});

describe("M-05 — analytics.ts uses substring LIKE (%query%) for all columns", () => {
  const src = readRouter("analytics.ts");

  it("defines searchTerm variable as substring pattern (%query%)", () => {
    expect(src).toContain("const searchTerm =");
    expect(src).toMatch(/const searchTerm\s*=\s*`%\$\{input\.query\}%`/);
  });

  it("does NOT define searchPrefix (prefix-only search was reverted)", () => {
    expect(src).not.toContain("searchPrefix");
  });

  it("vehicleRegistration LIKE uses searchTerm (substring)", () => {
    expect(src).toMatch(/vehicleRegistration.*LIKE.*searchTerm/);
  });

  it("claimNumber LIKE uses searchTerm (substring)", () => {
    expect(src).toMatch(/claimNumber.*LIKE.*searchTerm/);
  });

  it("policyNumber LIKE uses searchTerm (substring)", () => {
    expect(src).toMatch(/policyNumber.*LIKE.*searchTerm/);
  });

  it("documents TiDB FULLTEXT limitation and KINGA-SEARCH-01", () => {
    expect(src).toContain("KINGA-SEARCH-01");
  });
});

describe("M-05 — migration script documents TiDB FULLTEXT limitation and adds composite indexes", () => {
  const migrationSrc = readFile("run-fulltext-migration.mjs");

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

describe("M-01 — routers.ts unbounded query fixes", () => {
  const src = readFile("server/routers.ts");

  it("assessorSubscriptions list has .limit(200)", () => {
    expect(src).toMatch(/from\(asSubs\)\.orderBy\(asSubs\.tier\)\.limit\(200\)/);
  });

  it("pendingQuotes by status has .limit(500)", () => {
    // Find the SELECT query that uses payment_submitted (not the UPDATE SET)
    const idx = src.indexOf(".where(eq(insuranceQuotes.status, 'payment_submitted'))");
    expect(idx).toBeGreaterThan(-1);
    const context = src.slice(idx, idx + 100);
    expect(context).toContain(".limit(500)");
  });

  it("insuranceQuotes by customerId has .limit(100)", () => {
    const idx = src.indexOf("insuranceQuotes.customerId, ctx.user.id");
    expect(idx).toBeGreaterThan(-1);
    const context = src.slice(idx, idx + 200);
    expect(context).toContain(".limit(100)");
  });
});
