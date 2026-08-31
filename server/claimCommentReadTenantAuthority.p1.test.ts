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
    expect(helperSource).toContain("AND cc.tenant_id = ?\n         AND c.tenant_id = ?");
    expect(helperSource).not.toContain("c.tenantId");
    expect(helperSource).toContain("INNER JOIN claims c ON c.id = cc.claimId");
  });
});
