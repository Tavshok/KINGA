import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/asset-passport.ts"), "utf8");

describe("asset passport tenant authority", () => {
  it("requires a session tenant at the shared procedure boundary", () => {
    expect(source).toContain("protectedProcedure as baseProtectedProcedure");
    expect(source).toContain("function requireAssetPassportTenant");
    expect(source).toContain("const protectedProcedure = baseProtectedProcedure.use");
    expect(source).toContain("requireAssetPassportTenant(ctx)");
  });
});
