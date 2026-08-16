import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/intelligence-platform.ts"), "utf8");

describe("intelligence platform empty-tenant authority", () => {
  it("requires a session tenant at the shared protected procedure boundary", () => {
    expect(source).toContain("protectedProcedure as baseProtectedProcedure");
    expect(source).toContain("const protectedProcedure = baseProtectedProcedure.use");
    expect(source).toContain("requireIntelligenceTenant(ctx)");
  });
});
