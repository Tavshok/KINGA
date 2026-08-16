import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/recovery.ts"),
  "utf8",
);

const correspondenceBlock = source.slice(
  source.indexOf("addCorrespondenceEntry: protectedProcedure"),
  source.indexOf("exportCorrespondenceLog: protectedProcedure"),
);

describe("recovery correspondence tenant authority", () => {
  it("requires a recovery role and tenant-scoped recovery case before logging correspondence", () => {
    expect(correspondenceBlock).toContain("allowedRoles = ['recovery_officer','claims_manager','executive','insurer_admin']");
    expect(correspondenceBlock).toContain("eq(recoveryCases.id, input.caseId)");
    expect(correspondenceBlock).toContain("eq(recoveryCases.tenantId, tenantId)");
    expect(correspondenceBlock).toContain("Recovery case not found");
  });
});
