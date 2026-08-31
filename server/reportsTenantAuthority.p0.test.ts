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

  it("applies the standard report access matrix to each alternate PDF route before database access", () => {
    expect(source).toContain('import { canAccessReport } from \'./reporting\'');
    const expectations = [
      ["generateExecutiveReport:", "executive.portfolio_overview"],
      ["generateFinancialSummary:", "executive.portfolio_overview"],
      ["generateAuditTrailReport:", "claim.audit_trail"],
    ] as const;
    for (const [name, reportKey] of expectations) {
      const block = source.slice(source.indexOf(name), source.indexOf("}),", source.indexOf(name)) + 3);
      expect(block).toContain(`requireAlternateReportAccess(ctx, "${reportKey}")`);
      expect(block.indexOf(`requireAlternateReportAccess(ctx, "${reportKey}")`)).toBeLessThan(block.indexOf("await getDb()"));
    }
  });
});
