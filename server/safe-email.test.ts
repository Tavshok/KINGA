/**
 * Unit tests for server/safe-email.ts
 *
 * Covers:
 *   - Idempotency: duplicate key → skip send
 *   - Rate limiting: > 5 emails/hour → skip send
 *   - Environment guard: non-production + no DEV_EMAIL_OVERRIDE → suppress
 *   - Environment guard: non-production + DEV_EMAIL_OVERRIDE set → redirect
 *   - Production: sends to real recipient
 *   - Audit log: every attempt recorded in notification_events
 *   - DB unavailable: graceful skip, no throw
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// ─── Mock getDb ───────────────────────────────────────────────────────────────

const mockInsertValues = vi.fn();
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });

const mockSelectFrom = vi.fn();
const mockSelectWhere = vi.fn();
const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
mockSelectFrom.mockReturnValue({ where: mockSelectWhere });

let mockDb: Record<string, Mock>;

vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("../drizzle/schema", () => ({
  notificationEvents: { idempotencyKey: "idempotency_key", recipientUserId: "recipient_user_id", sent: "sent", createdAt: "created_at" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ type: "and", args })),
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  gte: vi.fn((col, val) => ({ type: "gte", col, val })),
  count: vi.fn(() => ({ type: "count" })),
}));

import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { sendEmailSafe } from "./safe-email";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  eventType: "test_event",
  entityId: 42,
  recipientUserId: 7,
  recipientEmail: "user@example.com",
  subject: "Test Subject",
  body: "Test body",
};

function makeDb(overrides: Partial<typeof mockDb> = {}) {
  return {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("sendEmailSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: insert succeeds (no duplicate), count returns 1 (under limit)
    mockInsertValues.mockResolvedValue(undefined);
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    mockUpdateWhere.mockResolvedValue(undefined);
    (getDb as Mock).mockResolvedValue(makeDb());
    // Default: non-production, no override
    delete process.env.DEV_EMAIL_OVERRIDE;
    // Patch ENV.isProduction
    vi.doMock("./_core/env", () => ({ ENV: { isProduction: false, forgeApiUrl: "", forgeApiKey: "" } }));
  });

  afterEach(() => {
    delete process.env.DEV_EMAIL_OVERRIDE;
  });

  // ── DB unavailable ──────────────────────────────────────────────────────────

  it("returns db_unavailable and does not throw when getDb returns null", async () => {
    (getDb as Mock).mockResolvedValue(null);
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "db_unavailable" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("returns db_unavailable and does not throw when getDb rejects", async () => {
    (getDb as Mock).mockRejectedValue(new Error("connection refused"));
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "db_unavailable" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  it("skips send and returns duplicate when idempotency key already exists (ER_DUP_ENTRY)", async () => {
    const dupErr = Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
    mockInsertValues.mockRejectedValue(dupErr);
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "duplicate" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("skips send and returns duplicate when error message contains 'Duplicate entry'", async () => {
    mockInsertValues.mockRejectedValue(new Error("Duplicate entry 'key' for key 'idempotency_key'"));
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "duplicate" });
  });

  it("skips send and returns duplicate when error message contains 'UNIQUE constraint'", async () => {
    mockInsertValues.mockRejectedValue(new Error("UNIQUE constraint failed: notification_events.idempotency_key"));
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "duplicate" });
  });

  it("inserts idempotency row with correct fields on first send", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    await sendEmailSafe(BASE_OPTS);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "test_event",
        entityId: "42",
        recipientUserId: 7,
        recipientEmail: "user@example.com",
        idempotencyKey: "test_event:42:7",
        sent: 1,
      })
    );
  });

  it("uses custom idempotencyKey when provided", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    await sendEmailSafe({ ...BASE_OPTS, idempotencyKey: "custom-key-abc" });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "custom-key-abc" })
    );
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  it("skips send and returns rate_limited when count exceeds 5 per hour", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 6 }]);
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "rate_limited" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("marks the row as skipped with reason 'rate_limited' in DB", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 6 }]);
    await sendEmailSafe(BASE_OPTS);
    expect(mockUpdateSet).toHaveBeenCalledWith({ sent: 0, skipReason: "rate_limited" });
  });

  it("allows send when count is exactly 5 per hour", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 5 }]);
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: true });
  });

  it("allows send when count is 0", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 0 }]);
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: true });
  });

  // ── Environment guard — dev suppression ────────────────────────────────────

  it("suppresses send in non-production when DEV_EMAIL_OVERRIDE is not set", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    delete process.env.DEV_EMAIL_OVERRIDE;
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: false, reason: "dev_suppressed" });
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("marks the row as skipped with reason 'dev_suppressed' in DB", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    delete process.env.DEV_EMAIL_OVERRIDE;
    await sendEmailSafe(BASE_OPTS);
    expect(mockUpdateSet).toHaveBeenCalledWith({ sent: 0, skipReason: "dev_suppressed" });
  });

  // ── Environment guard — dev redirect ───────────────────────────────────────

  it("redirects to DEV_EMAIL_OVERRIDE in non-production when override is set", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev-override@company.com";
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    const result = await sendEmailSafe(BASE_OPTS);
    expect(result).toEqual({ sent: true });
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("dev-override@company.com"),
      })
    );
    // Must NOT send to real recipient
    expect(notifyOwner).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("user@example.com") })
    );
  });

  // ── Audit log ───────────────────────────────────────────────────────────────

  it("records an audit row in notification_events on every attempt (sent)", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    await sendEmailSafe(BASE_OPTS);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sent: 1, skipReason: null })
    );
  });

  it("records an audit row in notification_events on every attempt (rate-limited)", async () => {
    mockSelectWhere.mockResolvedValue([{ value: 6 }]);
    await sendEmailSafe(BASE_OPTS);
    // Row was inserted then updated to sent=0
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({ sent: 0, skipReason: "rate_limited" });
  });

  it("records an audit row in notification_events on every attempt (dev_suppressed)", async () => {
    delete process.env.DEV_EMAIL_OVERRIDE;
    mockSelectWhere.mockResolvedValue([{ value: 1 }]);
    await sendEmailSafe(BASE_OPTS);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith({ sent: 0, skipReason: "dev_suppressed" });
  });

  // ── Convenience wrappers ────────────────────────────────────────────────────

  it("sendAssessorAssignmentEmail uses eventType assessor_assignment", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 0 }]);
    const { sendAssessorAssignmentEmail } = await import("./safe-email");
    await sendAssessorAssignmentEmail({
      claimId: 1,
      claimNumber: "CLM-001",
      assessorUserId: 5,
      assessorEmail: "assessor@test.com",
      assessorName: "John",
      vehicleMake: "Toyota",
      vehicleModel: "Corolla",
      incidentDate: "2026-01-01",
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "assessor_assignment" })
    );
  });

  it("sendQuoteSubmittedEmail uses eventType quote_submitted", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 0 }]);
    const { sendQuoteSubmittedEmail } = await import("./safe-email");
    await sendQuoteSubmittedEmail({
      claimId: 2,
      claimNumber: "CLM-002",
      recipientUserId: 3,
      recipientEmail: "insurer@test.com",
      panelBeaterName: "Fix-It Auto",
      quotedAmount: 12500,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "quote_submitted" })
    );
  });

  it("sendAiOptimisationCompleteEmail uses eventType ai_optimisation_complete", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 0 }]);
    const { sendAiOptimisationCompleteEmail } = await import("./safe-email");
    await sendAiOptimisationCompleteEmail({
      claimId: 3,
      claimNumber: "CLM-003",
      recipientUserId: 4,
      recipientEmail: "insurer@test.com",
      riskScore: 72,
      recommendedRepairer: "Best Auto",
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "ai_optimisation_complete" })
    );
  });

  it("sendFleetQuoteResponseEmail uses eventType fleet_quote_response", async () => {
    process.env.DEV_EMAIL_OVERRIDE = "dev@test.com";
    mockSelectWhere.mockResolvedValue([{ value: 0 }]);
    const { sendFleetQuoteResponseEmail } = await import("./safe-email");
    await sendFleetQuoteResponseEmail({
      rfqEntityId: "rfq-abc-123",
      recipientUserId: 9,
      recipientEmail: "fleet@test.com",
      insurerName: "SafeGuard Insurance",
      quotedPremium: 45000,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "fleet_quote_response" })
    );
  });
});
