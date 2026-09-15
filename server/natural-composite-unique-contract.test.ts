import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const transition = readFileSync(resolve(root, "audit/natural-composite-unique-2026-09-15/natural-composite-unique-constraints.sql"), "utf8");

function declaration(symbol: string) {
  const start = schema.indexOf(`export const ${symbol} = mysqlTable(`);
  const end = schema.indexOf("\nexport const ", start + 1);
  return schema.slice(start, end === -1 ? undefined : end);
}

describe("approved natural/composite unique source contract", () => {
  it("replaces only the assessor/insurer non-unique pair index with the approved unique pair", () => {
    const source = declaration("assessorInsurerRelationships");
    expect(source).toContain('uniqueIndex("uq_assessor_insurer_relationship").on(table.assessorId, table.tenantId)');
    expect(source).not.toContain('index("unique_assessor_tenant")');
    expect(transition).toContain("DROP INDEX `unique_assessor_tenant` ON `assessor_insurer_relationships`;");
    expect(transition).toContain("CREATE UNIQUE INDEX `uq_assessor_insurer_relationship` ON `assessor_insurer_relationships` (`assessor_id`,`tenant_id`);");
  });

  it("declares the approved policy/claim and fleet/driver pair constraints with their confirmed physical identities", () => {
    expect(declaration("policyClaimLinks")).toContain('uniqueIndex("uq_policy_claim_link").on(table.policyId, table.claimId)');
    expect(declaration("fleetDrivers")).toContain('uniqueIndex("uq_fleet_driver_membership").on(table.fleetId, table.userId)');
    expect(transition).toContain("CREATE UNIQUE INDEX `uq_policy_claim_link` ON `policy_claim_links` (`policy_id`,`claim_id`);");
    expect(transition).toContain("CREATE UNIQUE INDEX `uq_fleet_driver_membership` ON `fleet_drivers` (`fleet_id`,`user_id`);");
  });

  it("keeps the append-only entity relationship observation model without a secondary unique constraint", () => {
    expect(declaration("entityRelationships")).not.toContain("uniqueIndex(");
    expect(transition).not.toContain("entity_relationships");
  });
});
