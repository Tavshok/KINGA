import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/admin.ts"), "utf8");

describe("administrative observability tenant authority", () => {
  it("requires explicit tenant selection for platform metric reads and collection", () => {
    const region = source.slice(source.indexOf("getObservabilityMetrics:"), source.indexOf("getPendingRegistrations:"));
    expect((region.match(/tenantId: z\.string\(\)\.min\(1\)/g) ?? []).length).toBe(2);
    expect(region).toContain("getLatestObservabilityMetrics(input.tenantId)");
    expect(region).toContain("collectAndStoreObservabilityMetrics(input.tenantId)");
    expect(region).not.toContain("ctx.user.tenantId ?? undefined");
  });
});
