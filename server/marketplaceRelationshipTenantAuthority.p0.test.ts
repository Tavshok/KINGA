import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/marketplace.ts"),
  "utf8",
);

function block(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("marketplace relationship tenant authority", () => {
  it("requires the authenticated tenant to equal the requested insurer tenant for panel-beater listings", () => {
    const panelBeaters = block("getApprovedPanelBeaters: protectedProcedure", "getApprovedAssessors: protectedProcedure");
    expect(panelBeaters).toContain("ctx.user.tenantId !== input.insurerTenantId");
    expect(panelBeaters).toContain("Insurer tenant scope mismatch");
  });

  it("requires the authenticated tenant to equal the requested insurer tenant for assessor listings", () => {
    const assessors = source.slice(source.indexOf("getApprovedAssessors: protectedProcedure"));
    expect(assessors).toContain("ctx.user.tenantId !== input.insurerTenantId");
    expect(assessors).toContain("Insurer tenant scope mismatch");
  });
});
