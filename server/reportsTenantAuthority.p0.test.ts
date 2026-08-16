import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/reports.ts"), "utf8");

describe("generated reports tenant authority", () => {
  it("requires a session tenant and rejects supplied tenant mismatches for all report generators", () => {
    expect(source).toContain("function requireReportTenant");
    expect(source).toContain("Requested tenant does not match the authenticated tenant");
    for (const name of ["generateExecutiveReport:", "generateFinancialSummary:", "generateAuditTrailReport:"]) {
      const block = source.slice(source.indexOf(name), source.indexOf("}),", source.indexOf(name)) + 3);
      expect(block).toContain("requireReportTenant(ctx.user.tenantId, input.tenantId)");
    }
  });
});
