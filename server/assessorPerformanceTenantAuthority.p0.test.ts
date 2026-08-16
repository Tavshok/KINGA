import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/assessors-core.ts"), "utf8");

describe("assessor performance tenant authority", () => {
  it("requires a session tenant and resolves the requested assessor within it before claim metrics", () => {
    expect(source).toContain("const tenantId = ctx.user.tenantId;");
    expect(source).toContain("A tenant-scoped session is required");
    expect(source).toContain("eq(users.id, input.assessorId), eq(users.tenantId, tenantId)");
    expect(source).toContain("getClaimsByAssessor(input.assessorId, tenantId)");
  });
});
