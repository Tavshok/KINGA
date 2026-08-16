import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/ml.ts"), "utf8");

describe("ML tenant authority", () => {
  it("requires tenant-owned historical claims for confidence scoring", () => {
    expect(source).toContain("function requireMlTenant");
    expect(source).toContain("eq(historicalClaims.tenantId, tenantId)");
  });

  it("retains tenant scope for approve and reject training decisions", () => {
    expect(source).toContain("eq(claimReviewQueue.tenantId, requireMlTenant(ctx))");
    expect(source).toContain("reviewDecision: \"approve\"");
    expect(source).toContain("reviewDecision: \"reject\"");
  });
});
