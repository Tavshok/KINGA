import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  const end = vi.fn();
  const createConnection = vi.fn(async () => ({ execute, end }));
  return { execute, end, createConnection };
});

vi.mock("mysql2/promise", () => ({ default: { createConnection: mocks.createConnection } }));

import { getAuthorisedReportObject, getJobStatus, recordDownload, type ReportJobAccessScope } from "./reporting/reportQueue";
import { assertAgencyQuoteTenant } from "./routers/agency-broker";
import { assertIntelligenceRole, resolveIntelligenceScope } from "./routers/intelligence";
import { resolveP0TenantScope } from "./security/p0TenantBoundary";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const userA: ReportJobAccessScope = { tenantId: tenantA, userId: 101, isPlatformSuperAdmin: false };

describe("P0 Package 1 runtime — report job direct-ID isolation", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.end.mockReset();
    mocks.createConnection.mockClear();
    mocks.execute.mockImplementation(async (query: string, values: unknown[]) => {
      if (query.includes("SELECT job_id") && values[0] === "job-a" && values.includes(tenantA) && values.includes(101)) {
        return [[{ job_id: "job-a", report_key: "claim.intelligence", status: "completed", s3_key: "reports/tenant-a/job-a.pdf" }]];
      }
      if (query.includes("SELECT job_id, s3_key") && values[0] === "job-a" && values.includes(tenantA) && values.includes(101)) {
        return [[{ job_id: "job-a", report_key: "claim.intelligence", status: "completed", s3_key: "reports/tenant-a/job-a.pdf" }]];
      }
      return [[]];
    });
  });

  it("permits same-tenant job status and blocks a foreign direct job ID", async () => {
    await expect(getJobStatus("job-a", userA)).resolves.toMatchObject({ job_id: "job-a" });
    await expect(getJobStatus("job-b", userA)).resolves.toBeNull();
  });

  it("does not reveal the private object key or record a foreign download", async () => {
    await expect(getAuthorisedReportObject("job-b", userA)).resolves.toBeNull();
    await expect(recordDownload("job-b", userA)).resolves.toBe(false);
    expect(mocks.execute.mock.calls.some(([query]) => String(query).startsWith("UPDATE report_jobs"))).toBe(false);
  });

  it("permits the same tenant's report object path only through the scoped lookup", async () => {
    await expect(getAuthorisedReportObject("job-a", userA)).resolves.toMatchObject({ s3_key: "reports/tenant-a/job-a.pdf" });
    const select = mocks.execute.mock.calls.find(([query]) => String(query).includes("SELECT job_id, s3_key"));
    expect(select?.[1]).toEqual(expect.arrayContaining(["job-a", tenantA, 101]));
  });
});

describe("P0 Package 1 runtime — request scope controls", () => {
  const ordinaryAgency = { user: { id: 102, role: "agency", tenantId: tenantA } };

  it("rejects a foreign agency quote even if a stale row enters the mutation path", () => {
    expect(() => assertAgencyQuoteTenant(tenantB, tenantA)).toThrow("Quote request not found.");
    expect(() => assertAgencyQuoteTenant(tenantA, tenantA)).not.toThrow();
  });

  it("rejects ordinary tenant overrides before report or schedule work can begin", () => {
    expect(() => resolveP0TenantScope(ordinaryAgency, tenantB, "reporting.deleteSchedule")).toThrow("does not match the authenticated session");
    expect(resolveP0TenantScope(ordinaryAgency, tenantA, "reporting.deleteSchedule").tenantId).toBe(tenantA);
  });

  it("rejects unauthorised intelligence users and foreign ordinary-user scope", async () => {
    expect(() => assertIntelligenceRole({ user: { id: 201, role: "claimant", tenantId: tenantA } })).toThrow("Authorised intelligence role required.");
    await expect(resolveIntelligenceScope({ user: { id: 202, role: "insurer", insurerRole: "risk_manager", tenantId: tenantA } }, tenantB, "intelligence.getDriverRegistry")).rejects.toThrow("does not match the authenticated session");
  });

  it("keeps an authorised insurer intelligence query in its own tenant", async () => {
    const scope = await resolveIntelligenceScope({ user: { id: 203, role: "insurer", insurerRole: "risk_manager", tenantId: tenantA } }, undefined, "intelligence.getRelationshipGraph");
    expect(scope).toMatchObject({ tenantId: tenantA, isCrossTenant: false });
  });
});
