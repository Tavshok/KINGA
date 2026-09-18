import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WorkOS Package A schema contract", () => {
  it("declares only the approved nullable 128-character user and organization identifiers with unique indexes", async () => {
    const schema = await readFile(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(schema).toContain('workosOrganizationId: varchar("workos_organization_id", { length: 128 })');
    expect(schema).toContain('uniqueIndex("tenants_workos_organization_id_unique").on(table.workosOrganizationId)');
    expect(schema).toContain('workosUserId: varchar("workos_user_id", { length: 128 })');
    expect(schema).toContain('uniqueIndex("users_workos_user_id_unique").on(table.workosUserId)');
  });

  it("does not introduce a provider identity table, WorkOS dependency, or authentication route change", async () => {
    const schema = await readFile(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(schema).not.toMatch(/provider[_-]?identit/i);
    expect(schema).not.toMatch(/authkit|workos-sdk/i);
  });
});
