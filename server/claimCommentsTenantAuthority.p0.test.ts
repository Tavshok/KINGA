import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/claimComments.ts"), "utf8");

describe("claim comment tenant authority", () => {
  it("requires a session tenant and resolves the target claim in that tenant before comments or notifications", () => {
    expect(source).toContain("const tenantId = user.tenantId;");
    expect(source).toContain("A tenant-scoped session is required");
    expect(source).toContain("WHERE id = ? AND tenant_id = ? LIMIT 1");
    expect(source).toContain("[input.claimId, tenantId]");
    expect(source).toContain("Claim not found");
  });
});
