import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/truth-synthesis.ts"), "utf8");

describe("Truth Synthesis assessor analytics authority", () => {
  it("limits tenantless assessor-deviation aggregates to explicit platform observability", () => {
    expect(source).toContain("assessor_deviation_metrics has no tenant key");
    expect(source).toContain('ctx.user.role !== "platform_super_admin"');
    expect(source).toContain("Platform observability access is required");
  });
});
