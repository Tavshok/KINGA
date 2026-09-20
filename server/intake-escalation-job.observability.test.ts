import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  findLowestWorkloadProcessor: vi.fn(),
  createNotification: vi.fn(),
  notifyOwner: vi.fn(),
  insertIsoAuditLog: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./workload-balancing", () => ({
  findLowestWorkloadProcessor: mocks.findLowestWorkloadProcessor,
}));
vi.mock("./notification-service", () => ({
  createNotification: mocks.createNotification,
  formatNotificationTitle: vi.fn(() => "title"),
  formatNotificationMessage: vi.fn(() => "message"),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));
vi.mock("./utils/audit-helpers", () => ({
  SYSTEM_USER_ID: 0,
  insertIsoAuditLog: mocks.insertIsoAuditLog,
}));

import { runIntakeEscalationJob } from "./intake-escalation-job";

function createQueryDb(results: unknown[][]) {
  let cursor = 0;
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(results[cursor++] ?? [])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
  };
}

function loggedEvents(warn: ReturnType<typeof vi.spyOn>) {
  return warn.mock.calls
    .map(call => String(call[0]))
    .filter(value =>
      value.includes('"event":"scheduled_claim_race_observation"')
    )
    .map(value => JSON.parse(value));
}

describe("intake escalation scheduled observability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("correlates an auto-assignment and its aggregate notification without claim PII", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createQueryDb([
      [
        {
          id: 7,
          name: "tenant-name-not-logged",
          intakeEscalationEnabled: 1,
          intakeEscalationHours: 6,
          intakeEscalationMode: "auto_assign",
        },
      ],
      [
        {
          id: 41,
          tenantId: 7,
          claimNumber: "DOC-PII-MUST-NOT-APPEAR",
          createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        },
      ],
      [{ id: 20 }],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.findLowestWorkloadProcessor.mockResolvedValue({
      processorId: 20,
      processorName: "not-logged-in-observation",
      weightedScore: 1,
      activeClaims: 0,
      complexClaims: 0,
      highRiskClaims: 0,
    });
    mocks.createNotification.mockResolvedValue(undefined);
    mocks.notifyOwner.mockResolvedValue(true);
    mocks.insertIsoAuditLog.mockResolvedValue(undefined);

    await runIntakeEscalationJob({
      source: "heartbeat",
      heartbeatTaskUid: "task-observe-1",
    });

    const events = loggedEvents(warn);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          job_key: "intake-escalation",
          invocation_source: "heartbeat",
          heartbeat_task_uid: "task-observe-1",
          action: "intake_auto_assign",
          claim_ref: "claim:41",
          phase: "candidate_selected",
        }),
        expect.objectContaining({
          action: "intake_auto_assign_notification",
          claim_ref: null,
          candidate_count: 1,
          batch_fingerprint: expect.any(String),
        }),
      ])
    );
    expect(JSON.stringify(events)).not.toContain("DOC-PII-MUST-NOT-APPEAR");
  });

  it("records a redacted notification failure without changing escalation behavior", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = createQueryDb([
      [
        {
          id: 7,
          name: "tenant-name-not-logged",
          intakeEscalationEnabled: 1,
          intakeEscalationHours: 6,
          intakeEscalationMode: "escalate_only",
        },
      ],
      [
        {
          id: 41,
          tenantId: 7,
          claimNumber: "DOC-PII-MUST-NOT-APPEAR",
          createdAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
        },
      ],
      [{ id: 20 }],
    ]);
    mocks.getDb.mockResolvedValue(db);
    mocks.insertIsoAuditLog.mockResolvedValue(undefined);
    mocks.createNotification.mockRejectedValue(
      Object.assign(
        new Error("https://private.example/document.pdf?token=secret"),
        {
          code: "https://private.example/document.pdf?token=secret",
        }
      )
    );

    await runIntakeEscalationJob({ source: "in_process_interval" });

    const events = loggedEvents(warn);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invocation_source: "in_process_interval",
          action: "intake_escalation_notification",
          phase: "error",
          error_code: "UNCLASSIFIED_ERROR",
        }),
      ])
    );
    expect(JSON.stringify(events)).not.toContain("private.example");
    expect(JSON.stringify(events)).not.toContain("DOC-PII-MUST-NOT-APPEAR");
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });
});
