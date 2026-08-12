import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueReport: vi.fn(async () => "job-a"),
  getJobStatus: vi.fn(async () => ({ job_id: "job-a", status: "completed" })),
  getAuthorisedReportObject: vi.fn(async () => ({ job_id: "job-a", status: "completed", s3_key: "reports/tenant-a/job-a.pdf", report_key: "portfolio.claims_summary" })),
  recordDownload: vi.fn(async () => true),
  getUserJobs: vi.fn(async () => [{ job_id: "job-a" }]),
  storageGet: vi.fn(async () => ({ url: "https://example.invalid/report.pdf" })),
  execute: vi.fn(),
  end: vi.fn(),
  createConnection: vi.fn(),
}));

mocks.createConnection.mockImplementation(async () => ({ execute: mocks.execute, end: mocks.end }));

vi.mock("./reporting/reportQueue", () => ({
  enqueueReport: mocks.enqueueReport,
  getJobStatus: mocks.getJobStatus,
  getAuthorisedReportObject: mocks.getAuthorisedReportObject,
  recordDownload: mocks.recordDownload,
  getUserJobs: mocks.getUserJobs,
}));
vi.mock("./storage", () => ({ storageGet: mocks.storageGet }));
vi.mock("mysql2/promise", () => ({
  default: { createConnection: (...args: unknown[]) => mocks.createConnection(...args) },
}));

import { reportingRouter } from "./routers/reporting";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const ctx = {
  user: { id: 101, name: "Tenant A Manager", email: "a@example.test", role: "insurer", insurerRole: "claims_manager", tenantId: tenantA },
  req: { headers: {} },
} as any;

describe("P0 Package 1 runtime — reporting router two-tenant boundary", () => {
  beforeEach(() => {
    for (const mock of [mocks.enqueueReport, mocks.getJobStatus, mocks.getAuthorisedReportObject, mocks.recordDownload, mocks.getUserJobs, mocks.storageGet, mocks.execute, mocks.end]) mock.mockClear();
    mocks.getJobStatus.mockResolvedValue({ job_id: "job-a", status: "completed" });
    mocks.getAuthorisedReportObject.mockResolvedValue({ job_id: "job-a", status: "completed", s3_key: "reports/tenant-a/job-a.pdf", report_key: "portfolio.claims_summary" });
    mocks.recordDownload.mockResolvedValue(true);
    mocks.getUserJobs.mockResolvedValue([{ job_id: "job-a" }]);
    mocks.createConnection.mockResolvedValue({ execute: mocks.execute, end: mocks.end });
    mocks.execute.mockImplementation(async (query: string) => query.includes("SELECT id FROM report_schedules") ? [[{ id: 11 }]] : [[]]);
  });

  it("rejects a foreign tenant before report generation and generates in the session tenant", async () => {
    const caller = reportingRouter.createCaller(ctx);
    await expect(caller.generate({ reportKey: "portfolio.claims_summary", tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.generate({ reportKey: "portfolio.claims_summary" })).resolves.toEqual({ jobId: "job-a" });
    expect(mocks.enqueueReport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenantA, parameters: { tenantId: tenantA } }));
  });

  it("rejects foreign job access for polling, download URL, download recording, and job list", async () => {
    const caller = reportingRouter.createCaller(ctx);
    await expect(caller.getJobStatus({ jobId: "job-b", tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.getDownloadUrl({ jobId: "job-b", tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.recordDownload({ jobId: "job-b", tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.getMyJobs({ tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    expect(mocks.getJobStatus).not.toHaveBeenCalled();
    expect(mocks.getAuthorisedReportObject).not.toHaveBeenCalled();
    expect(mocks.recordDownload).not.toHaveBeenCalled();
  });

  it("permits same-tenant job polling, authorised retrieval, recording, and listing", async () => {
    const caller = reportingRouter.createCaller(ctx);
    await expect(caller.getJobStatus({ jobId: "job-a" })).resolves.toMatchObject({ job_id: "job-a" });
    await expect(caller.getDownloadUrl({ jobId: "job-a" })).resolves.toEqual({ url: "https://example.invalid/report.pdf" });
    await expect(caller.recordDownload({ jobId: "job-a" })).resolves.toEqual({ ok: true });
    await expect(caller.getMyJobs()).resolves.toEqual([{ job_id: "job-a" }]);
    expect(mocks.getJobStatus).toHaveBeenCalledWith("job-a", expect.objectContaining({ tenantId: tenantA, userId: 101 }));
    expect(mocks.recordDownload).toHaveBeenCalledWith("job-a", expect.objectContaining({ tenantId: tenantA, userId: 101 }));
  });

  it("rejects foreign schedule direct IDs before mutation and permits same-tenant deletion and toggle", async () => {
    const caller = reportingRouter.createCaller(ctx);
    await expect(caller.deleteSchedule({ scheduleId: 12, tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.toggleSchedule({ scheduleId: 12, isActive: true, tenantId: tenantB })).rejects.toThrow("does not match the authenticated session");
    await expect(caller.deleteSchedule({ scheduleId: 11 })).resolves.toEqual({ ok: true });
    await expect(caller.toggleSchedule({ scheduleId: 11, isActive: false })).resolves.toEqual({ ok: true });
    expect(mocks.execute.mock.calls.some(([query, values]) => String(query).includes("DELETE FROM report_schedules") && values.includes(tenantA))).toBe(true);
    expect(mocks.execute.mock.calls.some(([query, values]) => String(query).includes("UPDATE report_schedules") && values.includes(tenantA))).toBe(true);
  });
});
