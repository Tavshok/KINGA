import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers/reports.ts"),
  "utf8"
);
const trpcSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/_core/trpc.ts"),
  "utf8"
);
const rootRouterSource = fs.readFileSync(
  path.resolve(process.cwd(), "server/routers.ts"),
  "utf8"
);

describe("generated reports tenant authority", () => {
  it("requires a session tenant and rejects supplied tenant mismatches for all report generators", () => {
    expect(source).toContain("function requireReportTenant");
    expect(source).toContain(
      "Requested tenant does not match the authenticated tenant"
    );
    for (const name of [
      "generateExecutiveReport:",
      "generateFinancialSummary:",
      "generateAuditTrailReport:",
    ]) {
      const block = source.slice(
        source.indexOf(name),
        source.indexOf("}),", source.indexOf(name)) + 3
      );
      expect(block).toContain(
        "requireReportTenant(ctx.user.tenantId, input.tenantId)"
      );
    }
  });

  it("applies report access before database access and makes executive reporting terminally fail closed", () => {
    expect(source).toContain("import { canAccessReport } from './reporting'");
    const databaseBackedExpectations = [
      ["generateFinancialSummary:", "executive.portfolio_overview"],
      ["generateAuditTrailReport:", "claim.audit_trail"],
    ] as const;
    for (const [name, reportKey] of databaseBackedExpectations) {
      const block = source.slice(
        source.indexOf(name),
        source.indexOf("}),", source.indexOf(name)) + 3
      );
      expect(block).toContain(
        `requireAlternateReportAccess(ctx, "${reportKey}")`
      );
      expect(
        block.indexOf(`requireAlternateReportAccess(ctx, "${reportKey}")`)
      ).toBeLessThan(block.indexOf("await getDb()"));
    }

    const executiveBlock = source.slice(
      source.indexOf("generateExecutiveReport:"),
      source.indexOf("}),", source.indexOf("generateExecutiveReport:")) + 3
    );
    expect(executiveBlock).toContain(
      'requireAlternateReportAccess(ctx, "executive.portfolio_overview")'
    );
    expect(executiveBlock).toContain(
      'assertRestrictedAgencyAssistedCapability(ctx.user, "report_access")'
    );
    expect(executiveBlock).toContain(
      "requireReportTenant(ctx.user.tenantId, input.tenantId)"
    );
    expect(executiveBlock).toContain("throwP0B1FraudDecisionHold()");
    expect(executiveBlock).not.toContain("getDb()");
    expect(executiveBlock).not.toContain("generatePDFBuffer(");
    expect(executiveBlock).not.toContain("fraudDecisionNotice");
    expect(executiveBlock).not.toContain(".from(claims)");
    expect(
      executiveBlock.indexOf(
        'requireAlternateReportAccess(ctx, "executive.portfolio_overview")'
      )
    ).toBeLessThan(
      executiveBlock.indexOf(
        'assertRestrictedAgencyAssistedCapability(ctx.user, "report_access")'
      )
    );
    expect(
      executiveBlock.indexOf(
        'assertRestrictedAgencyAssistedCapability(ctx.user, "report_access")'
      )
    ).toBeLessThan(
      executiveBlock.indexOf(
        "requireReportTenant(ctx.user.tenantId, input.tenantId)"
      )
    );
    expect(
      executiveBlock.indexOf(
        "requireReportTenant(ctx.user.tenantId, input.tenantId)"
      )
    ).toBeLessThan(executiveBlock.indexOf("throwP0B1FraudDecisionHold()"));
  });

  it("binds the active executive route to the narrow authenticated authority seam rather than global agency preemption or an unguarded procedure", () => {
    const executiveBlock = source.slice(
      source.indexOf("generateExecutiveReport:"),
      source.indexOf("}),", source.indexOf("generateExecutiveReport:")) + 3
    );

    expect(rootRouterSource).toContain("reports: reportsRouter");
    expect(
      source.match(/\bexecutiveReportAuthorityProcedure\b/g) ?? []
    ).toHaveLength(2);
    expect(executiveBlock).toMatch(
      /^\s*generateExecutiveReport: executiveReportAuthorityProcedure/m
    );
    expect(executiveBlock).not.toContain("protectedProcedure");
    expect(executiveBlock).not.toContain("publicProcedure");
    expect(executiveBlock).not.toContain("t.procedure");

    expect(trpcSource).toContain(
      "export const executiveReportAuthorityProcedure = t.procedure.use(requireUser);"
    );
    expect(trpcSource).toContain(
      "export const protectedProcedure = t.procedure\n  .use(requireUser)\n  .use(rejectRestrictedAgencyAssistedIdentity);"
    );
  });
});
