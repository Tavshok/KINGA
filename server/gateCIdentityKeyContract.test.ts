import { getTableConfig } from "drizzle-orm/mysql-core";
import { describe, expect, it } from "vitest";
import { tenantInvitations, tenants, users } from "../drizzle/schema";

function column(table: Parameters<typeof getTableConfig>[0], name: string) {
  const found = getTableConfig(table).columns.find((candidate) => candidate.name === name);
  expect(found, `expected ${name} column`).toBeDefined();
  return found!;
}

function uniqueIndexNames(table: Parameters<typeof getTableConfig>[0]) {
  return getTableConfig(table).indexes
    .filter((candidate) => candidate.config.unique)
    .map((candidate) => candidate.config.name);
}

/**
 * Gate C Wave 1 contract. A new baseline must preserve the live application's
 * identity constraints; these tests neither open a database nor issue DDL.
 */
describe("Gate C Wave 1 identity and tenant key source contract", () => {
  it("declares the user, tenant, and invitation record identities as primary keys", () => {
    expect(column(users, "id").primary).toBe(true);
    expect(column(tenants, "id").primary).toBe(true);
    expect(column(tenantInvitations, "id").primary).toBe(true);
  });

  it("declares the duplicate-key identities used by current authentication and invitation flows", () => {
    expect(uniqueIndexNames(users)).toContain("users_openId_unique");
    expect(uniqueIndexNames(tenantInvitations)).toContain("tenant_invitations_token_unique");
  });
});
