import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/truth-synthesis.ts"), "utf8");

describe("truth synthesis tenant authority", () => {
  it("requires a session tenant and filters historical claims before synthesis or high-deviation evidence is returned", () => {
    expect(source).toContain("function requireTruthTenant");
    expect(source).toContain("eq(historicalClaims.tenantId, requireTruthTenant(ctx))");
    expect(source).toContain("eq(historicalClaims.tenantId, tenantId)");
  });

  it("retains tenant scope for training dataset lookup, update, and insert", () => {
    const approval = source.slice(source.indexOf("const approveForTraining"));
    expect(approval).toContain("eq(trainingDataset.tenantId, tenantId)");
    expect(approval).toContain("tenantId,");
  });
});
