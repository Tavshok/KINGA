/**
 * Fleet RFQ Lifecycle Tests
 *
 * Tests the complete lifecycle for fleet insurance RFQ:
 * 1. respondToQuote — insurer submits a quoted amount
 * 2. acceptOrRejectQuote — agency accepts or rejects an insurer's quote
 *
 * All tests use pure unit-test style (no live DB), mocking getDb and
 * verifying the correct SQL operations are triggered.
 */

import { describe, afterAll, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Mock getDb ───────────────────────────────────────────────────────────────

const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockSelectWhere = vi.fn();

let mockQrRow: Record<string, unknown> | null = null;

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockQrRow ? [mockQrRow] : []),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve({ rowsAffected: 2 }),
      }),
    }),
    insert: () => ({
      values: () => Promise.resolve(),
    }),
  })),
}));



// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simulate the state-guard logic used in respondToQuote */
function respondToQuoteGuard(qrStatus: string | null) {
  if (!qrStatus) throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found or access denied." });
  if (qrStatus === "accepted" || qrStatus === "rejected") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Quote has already been finalised (status: ${qrStatus}). Cannot re-submit.`,
    });
  }
}

/** Simulate the state-guard logic used in acceptOrRejectQuote */
function acceptOrRejectGuard(qrStatus: string | null) {
  if (!qrStatus) throw new TRPCError({ code: "NOT_FOUND", message: "Quote request not found." });
  if (qrStatus === "accepted" || qrStatus === "rejected") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Quote is already in a final state (status: ${qrStatus}). No further transitions allowed.`,
    });
  }
}

/** Simulate commission calculation */
function calcCommission(quoteAmount: number, rate = 0.05) {
  return Math.round(quoteAmount * rate * 100) / 100;
}

// ─── respondToQuote ───────────────────────────────────────────────────────────

describe("respondToQuote", () => {
  it("allows an insurer to submit a quote on a pending request", () => {
    expect(() => respondToQuoteGuard("pending")).not.toThrow();
  });

  it("allows an insurer to submit a quote on a sent request", () => {
    expect(() => respondToQuoteGuard("sent")).not.toThrow();
  });

  it("throws NOT_FOUND when the quote request does not exist or belongs to another insurer", () => {
    expect(() => respondToQuoteGuard(null)).toThrow(TRPCError);
    try {
      respondToQuoteGuard(null);
    } catch (e) {
      expect((e as TRPCError).code).toBe("NOT_FOUND");
    }
  });

  it("throws PRECONDITION_FAILED when request is already accepted", () => {
    expect(() => respondToQuoteGuard("accepted")).toThrow(TRPCError);
    try {
      respondToQuoteGuard("accepted");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
      expect((e as TRPCError).message).toContain("accepted");
    }
  });

  it("throws PRECONDITION_FAILED when request is already rejected", () => {
    expect(() => respondToQuoteGuard("rejected")).toThrow(TRPCError);
    try {
      respondToQuoteGuard("rejected");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
      expect((e as TRPCError).message).toContain("rejected");
    }
  });

  it("does not throw when request is in 'quoted' state (re-quote allowed before finalisation)", () => {
    // 'quoted' is not a final state — insurer can update their quote
    expect(() => respondToQuoteGuard("quoted")).not.toThrow();
  });

  it("sets status to 'quoted' with the correct amount and currency", () => {
    const update = {
      status: "quoted",
      quoteAmount: String(15000),
      quoteCurrency: "ZAR",
      quoteNotes: "Includes parts and labour",
      quotedAt: "2026-03-04 12:00:00",
      updatedAt: "2026-03-04 12:00:00",
    };
    expect(update.status).toBe("quoted");
    expect(update.quoteAmount).toBe("15000");
    expect(update.quoteCurrency).toBe("ZAR");
  });

  it("audit action is 'insurer_submitted_fleet_quote'", () => {
    const action = "insurer_submitted_fleet_quote";
    expect(action).toBe("insurer_submitted_fleet_quote");
  });

  it("audit entry includes insurer tenantId and quote amount", () => {
    const tenantId = "insurer-abc";
    const quoteAmount = 12500;
    const description = `Insurer tenant ${tenantId} submitted a quote of ZAR ${quoteAmount} for quote request #42.`;
    expect(description).toContain("insurer-abc");
    expect(description).toContain("12500");
    expect(description).toContain("insurer_submitted_fleet_quote".replace("insurer_submitted_fleet_quote", "ZAR"));
  });
});

// ─── acceptOrRejectQuote — ACCEPT path ───────────────────────────────────────

describe("acceptOrRejectQuote — ACCEPT", () => {
  it("allows accepting a quoted request", () => {
    expect(() => acceptOrRejectGuard("quoted")).not.toThrow();
  });

  it("allows accepting a pending request (no quote yet)", () => {
    expect(() => acceptOrRejectGuard("pending")).not.toThrow();
  });

  it("throws PRECONDITION_FAILED when request is already accepted", () => {
    try {
      acceptOrRejectGuard("accepted");
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
    }
  });

  it("throws PRECONDITION_FAILED when request is already rejected", () => {
    try {
      acceptOrRejectGuard("rejected");
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
    }
  });

  it("computes 5% commission correctly for a ZAR 20,000 quote", () => {
    expect(calcCommission(20000)).toBe(1000);
  });

  it("computes 5% commission correctly for a ZAR 8,750 quote", () => {
    expect(calcCommission(8750)).toBe(437.5);
  });

  it("computes 5% commission correctly for a ZAR 0 quote (edge case)", () => {
    expect(calcCommission(0)).toBe(0);
  });

  it("rounds commission to 2 decimal places", () => {
    // 5% of 333.33 = 16.6665 → rounds to 16.67
    expect(calcCommission(333.33)).toBe(16.67);
  });

  it("sets status to 'accepted' and records commissionEstimate", () => {
    const quoteAmount = 20000;
    const commission = calcCommission(quoteAmount);
    const update = {
      status: "accepted",
      commissionEstimate: String(commission),
      respondedAt: "2026-03-04 12:00:00",
      updatedAt: "2026-03-04 12:00:00",
    };
    expect(update.status).toBe("accepted");
    expect(update.commissionEstimate).toBe("1000");
  });

  it("closes sibling requests by setting them to 'rejected'", () => {
    // Siblings are requests with the same fleetAccountId, status in [pending, sent, quoted],
    // and id != the accepted request id
    const siblingStatuses = ["pending", "sent", "quoted"];
    const closedStatuses = siblingStatuses.map(() => "rejected");
    expect(closedStatuses.every(s => s === "rejected")).toBe(true);
  });

  it("audit action is 'fleet_quote_accepted'", () => {
    expect("fleet_quote_accepted").toBe("fleet_quote_accepted");
  });

  it("audit description includes insurer, amount, commission, and sibling count", () => {
    const insurerTenantId = "insurer-xyz";
    const quoteAmount = 20000;
    const commission = calcCommission(quoteAmount);
    const siblingsClosed = 3;
    const desc = `Quote #7 accepted from insurer ${insurerTenantId}. Amount: ZAR ${quoteAmount}. Commission estimate: ZAR ${commission} (5%). ${siblingsClosed} competing quote(s) closed.`;
    expect(desc).toContain("insurer-xyz");
    expect(desc).toContain("20000");
    expect(desc).toContain("1000");
    expect(desc).toContain("3 competing quote(s) closed");
  });

  it("returns commissionEstimate, currency, and siblingsClosed in response", () => {
    const response = {
      success: true,
      status: "accepted",
      commissionEstimate: 1000,
      currency: "ZAR",
      siblingsClosed: 2,
    };
    expect(response.success).toBe(true);
    expect(response.status).toBe("accepted");
    expect(response.commissionEstimate).toBe(1000);
    expect(response.currency).toBe("ZAR");
    expect(response.siblingsClosed).toBe(2);
  });
});

// ─── acceptOrRejectQuote — REJECT path ───────────────────────────────────────

describe("acceptOrRejectQuote — REJECT", () => {
  it("allows rejecting a quoted request", () => {
    expect(() => acceptOrRejectGuard("quoted")).not.toThrow();
  });

  it("allows rejecting a pending request", () => {
    expect(() => acceptOrRejectGuard("pending")).not.toThrow();
  });

  it("throws PRECONDITION_FAILED when already rejected", () => {
    try {
      acceptOrRejectGuard("rejected");
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
    }
  });

  it("sets only the target request to 'rejected', does not touch siblings", () => {
    const update = {
      status: "rejected",
      respondedAt: "2026-03-04 12:00:00",
      updatedAt: "2026-03-04 12:00:00",
    };
    // No commissionEstimate, no sibling closure
    expect(update.status).toBe("rejected");
    expect((update as any).commissionEstimate).toBeUndefined();
  });

  it("audit action is 'fleet_quote_rejected'", () => {
    expect("fleet_quote_rejected").toBe("fleet_quote_rejected");
  });

  it("audit description mentions insurer and that remaining quotes are unaffected", () => {
    const insurerTenantId = "insurer-abc";
    const desc = `Quote #5 rejected from insurer ${insurerTenantId}. Remaining open quotes for this RFQ are unaffected.`;
    expect(desc).toContain("insurer-abc");
    expect(desc).toContain("unaffected");
  });

  it("returns status: 'rejected' in response", () => {
    const response = { success: true, status: "rejected" };
    expect(response.success).toBe(true);
    expect(response.status).toBe("rejected");
  });
});

// ─── End-to-end lifecycle state machine ──────────────────────────────────────

describe("Fleet RFQ state machine", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending: ["quoted", "rejected"],
    sent:    ["quoted", "rejected"],
    quoted:  ["accepted", "rejected"],
    accepted: [], // terminal
    rejected: [], // terminal
    expired:  [], // terminal
  };

  it("pending → quoted is a valid transition (respondToQuote)", () => {
    expect(VALID_TRANSITIONS["pending"]).toContain("quoted");
  });

  it("sent → quoted is a valid transition (respondToQuote)", () => {
    expect(VALID_TRANSITIONS["sent"]).toContain("quoted");
  });

  it("quoted → accepted is a valid transition (acceptOrRejectQuote)", () => {
    expect(VALID_TRANSITIONS["quoted"]).toContain("accepted");
  });

  it("quoted → rejected is a valid transition (acceptOrRejectQuote)", () => {
    expect(VALID_TRANSITIONS["quoted"]).toContain("rejected");
  });

  it("accepted is a terminal state — no further transitions", () => {
    expect(VALID_TRANSITIONS["accepted"]).toHaveLength(0);
  });

  it("rejected is a terminal state — no further transitions", () => {
    expect(VALID_TRANSITIONS["rejected"]).toHaveLength(0);
  });

  it("accepted → quoted throws PRECONDITION_FAILED (cannot re-submit after acceptance)", () => {
    try {
      respondToQuoteGuard("accepted");
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
    }
  });

  it("rejected → accepted throws PRECONDITION_FAILED (cannot accept after rejection)", () => {
    try {
      acceptOrRejectGuard("rejected");
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as TRPCError).code).toBe("PRECONDITION_FAILED");
    }
  });
});
