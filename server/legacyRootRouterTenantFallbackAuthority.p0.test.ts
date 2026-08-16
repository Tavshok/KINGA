import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("legacy root router tenant fallback authority", () => {
  it("removes administrative/default tenant fallbacks from assessor evaluation and police report claim targets", () => {
    const evaluation = source.slice(source.indexOf("byClaim: protectedProcedure"), source.indexOf("assessorReports: router"));
    const police = source.slice(source.indexOf("policeReports: router"), source.indexOf("incidentType: router"));
    expect(evaluation).toContain("A tenant-scoped session is required");
    expect(evaluation).not.toContain("isAdminRole(ctx.user.role) ? undefined");
    expect(police).toContain("!isAdminRole(ctx.user.role)");
    expect(police).toContain("A tenant-scoped session is required");
    expect(police).not.toContain('ctx.user.tenantId || "default"');
  });
});
