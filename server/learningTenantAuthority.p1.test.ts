import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/learning.ts"), "utf8");

describe("learning tenant authority", () => {
  it("requires a session tenant and applies it to learning assessments and claims", () => {
    expect(source).toContain("function requireLearningTenant");
    expect(source).toContain("eq(aiAssessments.tenantId, tenantId)");
    expect(source).toContain("eq(claims.tenantId, tenantId)");
    expect(source).toContain("where(eq(claims.tenantId, tenantId))");
  });

  it("scopes out-of-domain signatures and calibration history to the session tenant", () => {
    expect(source).toContain("eq(costLearningRecords.tenantId, tenantId)");
    expect(source).toContain("where(eq(calibrationOverrides.tenantId, tenantId))");
    expect(source).toContain("tenantId,\n        jurisdiction: input.jurisdiction");
    expect(source).not.toContain('tenantId ?? "default"');
  });
});
