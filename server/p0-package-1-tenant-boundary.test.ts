import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveP0TenantScope } from "./security/p0TenantBoundary";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const tenantAUser = { user: { id: 101, role: "insurer", tenantId: tenantA } };

describe("P0 Package 1 — tenant scope contract", () => {
  it("keeps an ordinary user in their session tenant", () => {
    expect(resolveP0TenantScope(tenantAUser, undefined, "test")).toEqual({
      tenantId: tenantA,
      isPlatformSuperAdmin: false,
      isCrossTenant: false,
    });
  });

  it("rejects an ordinary user attempting a foreign tenant override", () => {
    expect(() => resolveP0TenantScope(tenantAUser, tenantB, "test")).toThrow("does not match the authenticated session");
  });

  it("fails closed when an ordinary user has no tenant", () => {
    expect(() => resolveP0TenantScope({ user: { id: 102, role: "insurer", tenantId: null } }, undefined, "test")).toThrow("Tenant context is required");
  });

  it("permits a platform super admin to select another tenant explicitly and marks it cross-tenant", () => {
    expect(resolveP0TenantScope({ user: { id: 1, role: "platform_super_admin", tenantId: tenantA } }, tenantB, "test")).toEqual({
      tenantId: tenantB,
      isPlatformSuperAdmin: true,
      isCrossTenant: true,
    });
  });

  it("does not grant a tenantless platform super admin implicit global access", () => {
    expect(() => resolveP0TenantScope({ user: { id: 1, role: "platform_super_admin", tenantId: null } }, undefined, "test")).toThrow("Explicit tenant selection is required");
  });
});

describe("P0 Package 1 — report lifecycle two-tenant barriers", () => {
  const reporting = read("server/routers/reporting.ts");
  const queue = read("server/reporting/reportQueue.ts");
  const button = read("client/src/components/KingaReportButton.tsx");

  it("uses an authorised tenant-object scope for polling, listing, recording, and retrieval", () => {
    for (const procedure of ["reporting.getJobStatus", "reporting.getMyJobs", "reporting.recordDownload", "reporting.getDownloadUrl"]) {
      expect(reporting).toContain(procedure);
    }
    expect(queue).toContain("tenant_id=? AND requested_by_user_id=?");
    expect(queue).toContain("WHERE job_id=? AND ${access.clause}");
  });

  it("does not select or return a stored download URL in report-job responses", () => {
    expect(queue).not.toContain("SELECT job_id, report_key, status, output_format, download_url,");
    expect(queue).toContain("download_url=NULL");
    expect(reporting).toContain("storageGet(job.s3_key, 300)");
    expect(button).toContain("getDownloadUrl.query({ jobId: activeJobId })");
    expect(button).not.toContain("job.download_url");
  });

  it("scopes preview and readiness claim lookups to tenant before producing report content", () => {
    expect(reporting).toContain("assertClaimInTenant(input.claimId, scope.tenantId)");
    expect(reporting).toContain("WHERE c.id = ? AND c.tenant_id = ?");
  });
});

describe("P0 Package 1 — agency quote two-tenant barrier", () => {
  const agency = read("server/routers/agency-broker.ts");

  it("looks up, mutates, and closes quote requests under the same authoritative agency tenant", () => {
    expect(agency).toContain("resolveP0TenantScope(ctx, input.tenantId, \"agencyBroker.acceptOrRejectQuote\")");
    expect(agency).toContain("eq(insurerQuoteRequests.agencyTenantId, scope.tenantId)");
    expect(agency).toContain("siblingConditions = [");
    expect(agency).toContain("eq(insurerQuoteRequests.agencyTenantId, scope.tenantId),");
  });
});

describe("P0 Package 1 — intelligence two-tenant barrier", () => {
  const intelligence = read("server/routers/intelligence.ts");

  it("rejects unapproved roles and uses the session-derived scope across registry procedures", () => {
    expect(intelligence).toContain("Authorised intelligence role required.");
    expect(intelligence).toContain("resolveP0TenantScope(ctx, requestedTenantId, procedureName)");
    expect(intelligence).not.toContain("sql.raw(");
  });

  it("constrains the relationship graph to its authoritative tenant_id", () => {
    expect(intelligence).toContain("FROM entity_relationship_graph WHERE tenant_id = ${scope.tenantId}");
    expect(intelligence).toContain("entity_a_type = ${input.entityType}");
    expect(intelligence).toContain("entity_b_type = ${input.entityType}");
  });
});
