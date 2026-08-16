import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routerSource = fs.readFileSync(path.resolve(process.cwd(), "server/routers/claimComments.ts"), "utf8");
const helperSource = fs.readFileSync(path.resolve(process.cwd(), "server/claim-comments-db.ts"), "utf8");

describe("claim comment read tenant authority", () => {
  it("requires session tenant for lists and notification reads and retains it in root and reply helper queries", () => {
    expect(routerSource).toContain("getClaimComments(input.claimId, user.id, userRole, userEmail, tenantId)");
    expect((routerSource.match(/A tenant-scoped session is required/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(routerSource).not.toContain("const tenantId = user.tenantId ?? \"\"");
    expect(helperSource).toContain("userEmail: string,\n  tenantId: string");
    expect(helperSource).toContain("AND cc.tenant_id = ?\n         AND c.tenantId = ?");
    expect(helperSource).toContain("WHERE cc.parent_comment_id = ? AND cc.tenant_id = ?");
  });
});
