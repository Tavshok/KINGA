import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/recovery.ts"), "utf8");

describe("recovery correspondence tenant authority", () => {
  it("requires a tenant session and resolves the recovery case before listing correspondence", () => {
    const block = source.slice(source.indexOf("getCorrespondenceLog:"), source.indexOf("addCorrespondenceEntry:"));
    expect(block).toContain("A tenant-scoped session is required");
    expect(block).toContain("eq(recoveryCases.id, input.caseId)");
    expect(block).toContain("eq(recoveryCases.tenantId, tenantId)");
    expect(block).toContain("eq(recoveryCorrespondenceLog.tenantId, tenantId)");
  });
});
