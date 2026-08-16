import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/quotes-core.ts"), "utf8");

describe("quote workflow tenant fallback authority", () => {
  it("uses the resolved tenant for comparison transition and optional quote notification", () => {
    const submit = source.slice(source.indexOf("submit:"), source.indexOf("byClaim:"));
    expect(submit).toContain('updateClaimStatus(input.claimId, "comparison", ctx.user.id, "panel_beater", tenantId)');
    expect(submit).toContain("tenantId,\n        });");
    expect(submit).not.toMatch(/tenantId\s*(\?\?|\|\|)\s*['"]default['"]/);
    expect(submit).not.toMatch(/claim\?\.tenantId\s*\|\|\s*['"]default['"]/);
  });
});
