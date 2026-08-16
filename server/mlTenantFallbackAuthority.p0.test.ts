import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/ml.ts"), "utf8");

describe("ML tenant fallback authority", () => {
  it("contains no static tenant fallback and derives all queue scope from the authenticated tenant", () => {
    expect(source).not.toMatch(/tenantId[^\n]*(\?\?|\|\|)\s*["']default["']/);
    const scopes = source.match(/requireMlTenant\(ctx\)/g) ?? [];
    expect(scopes.length).toBeGreaterThanOrEqual(6);
  });

  it("resolves the historical claim inside the session tenant before direct confidence scoring", () => {
    const scoring = source.slice(source.indexOf("calculateConfidenceScore: protectedProcedure"), source.indexOf("processConfidenceScore:"));
    expect(scoring).toContain("eq(historicalClaims.tenantId, requireMlTenant(ctx))");
    expect(scoring).toContain("Historical claim not found");
  });
});
