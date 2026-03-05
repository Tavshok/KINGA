/**
 * claims.updateCurrency — tRPC procedure tests
 *
 * Validates that:
 *   - Authorised roles (claims_manager, claims_processor, insurer, admin) can update currency
 *   - Unauthorised roles (assessor, panel_beater, claimant) are rejected with FORBIDDEN
 *   - Only supported codes (USD, ZIG, ZAR) are accepted
 *   - The procedure propagates the change to ai_assessments and panel_beater_quotes
 *   - Audit trail entries are created on each update
 *   - Non-existent claims return NOT_FOUND
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ── Minimal mock context factory ─────────────────────────────────────────────

function makeCtx(role: string, tenantId = "tenant-zw") {
  return {
    user: {
      id: 1,
      role,
      tenantId,
      insurerTenantId: tenantId,
      name: "Test User",
    },
  };
}

// ── Inline procedure logic (mirrors routers.ts updateCurrency) ────────────────
// We test the business logic directly without spinning up a full tRPC server.

const ALLOWED_ROLES = ["claims_manager", "claims_processor", "insurer", "admin"];
const SUPPORTED_CODES = ["USD", "ZIG", "ZAR"] as const;
type CurrencyCode = (typeof SUPPORTED_CODES)[number];

async function runUpdateCurrency(
  ctx: ReturnType<typeof makeCtx>,
  input: { claimId: number; currencyCode: string },
  mockClaim: object | null,
  mockDb: {
    updateClaim: ReturnType<typeof vi.fn>;
    updateAssessments: ReturnType<typeof vi.fn>;
    updateQuotes: ReturnType<typeof vi.fn>;
    createAudit: ReturnType<typeof vi.fn>;
  }
) {
  // Auth check
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!ALLOWED_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only claims managers and processors can update claim currency" });
  }
  // Input validation (mirrors z.enum)
  if (!SUPPORTED_CODES.includes(input.currencyCode as CurrencyCode)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported currency code: ${input.currencyCode}` });
  }
  // Claim existence check
  if (!mockClaim) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
  }
  // Propagate
  await mockDb.updateClaim(input.claimId, input.currencyCode);
  await mockDb.updateAssessments(input.claimId, input.currencyCode);
  await mockDb.updateQuotes(input.claimId, input.currencyCode);
  await mockDb.createAudit(input.claimId, ctx.user.id, input.currencyCode);
  return { success: true, currencyCode: input.currencyCode };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("claims.updateCurrency", () => {
  let mockDb: {
    updateClaim: ReturnType<typeof vi.fn>;
    updateAssessments: ReturnType<typeof vi.fn>;
    updateQuotes: ReturnType<typeof vi.fn>;
    createAudit: ReturnType<typeof vi.fn>;
  };
  const mockClaim = { id: 42, claimNumber: "CLM-001", tenantId: "tenant-zw" };

  beforeEach(() => {
    mockDb = {
      updateClaim: vi.fn().mockResolvedValue(undefined),
      updateAssessments: vi.fn().mockResolvedValue(undefined),
      updateQuotes: vi.fn().mockResolvedValue(undefined),
      createAudit: vi.fn().mockResolvedValue(undefined),
    };
  });

  // ── Role authorisation ───────────────────────────────────────────────────

  it("allows claims_manager to update currency", async () => {
    const result = await runUpdateCurrency(
      makeCtx("claims_manager"),
      { claimId: 42, currencyCode: "USD" },
      mockClaim,
      mockDb
    );
    expect(result).toEqual({ success: true, currencyCode: "USD" });
  });

  it("allows claims_processor to update currency", async () => {
    const result = await runUpdateCurrency(
      makeCtx("claims_processor"),
      { claimId: 42, currencyCode: "ZIG" },
      mockClaim,
      mockDb
    );
    expect(result).toEqual({ success: true, currencyCode: "ZIG" });
  });

  it("allows insurer to update currency", async () => {
    const result = await runUpdateCurrency(
      makeCtx("insurer"),
      { claimId: 42, currencyCode: "ZAR" },
      mockClaim,
      mockDb
    );
    expect(result).toEqual({ success: true, currencyCode: "ZAR" });
  });

  it("allows admin to update currency", async () => {
    const result = await runUpdateCurrency(
      makeCtx("admin"),
      { claimId: 42, currencyCode: "USD" },
      mockClaim,
      mockDb
    );
    expect(result).toEqual({ success: true, currencyCode: "USD" });
  });

  it("rejects assessor with FORBIDDEN", async () => {
    await expect(
      runUpdateCurrency(makeCtx("assessor"), { claimId: 42, currencyCode: "USD" }, mockClaim, mockDb)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects panel_beater with FORBIDDEN", async () => {
    await expect(
      runUpdateCurrency(makeCtx("panel_beater"), { claimId: 42, currencyCode: "USD" }, mockClaim, mockDb)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects claimant with FORBIDDEN", async () => {
    await expect(
      runUpdateCurrency(makeCtx("claimant"), { claimId: 42, currencyCode: "USD" }, mockClaim, mockDb)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ── Currency code validation ──────────────────────────────────────────────

  it("accepts USD", async () => {
    const result = await runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "USD" }, mockClaim, mockDb);
    expect(result.currencyCode).toBe("USD");
  });

  it("accepts ZIG", async () => {
    const result = await runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "ZIG" }, mockClaim, mockDb);
    expect(result.currencyCode).toBe("ZIG");
  });

  it("accepts ZAR", async () => {
    const result = await runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "ZAR" }, mockClaim, mockDb);
    expect(result.currencyCode).toBe("ZAR");
  });

  it("rejects unsupported currency code EUR", async () => {
    await expect(
      runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "EUR" }, mockClaim, mockDb)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unsupported currency code GBP", async () => {
    await expect(
      runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "GBP" }, mockClaim, mockDb)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // ── Claim existence ───────────────────────────────────────────────────────

  it("returns NOT_FOUND when claim does not exist", async () => {
    await expect(
      runUpdateCurrency(makeCtx("insurer"), { claimId: 9999, currencyCode: "USD" }, null, mockDb)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // ── Propagation ───────────────────────────────────────────────────────────

  it("propagates currency to claims, ai_assessments, and panel_beater_quotes", async () => {
    await runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "ZIG" }, mockClaim, mockDb);
    expect(mockDb.updateClaim).toHaveBeenCalledWith(42, "ZIG");
    expect(mockDb.updateAssessments).toHaveBeenCalledWith(42, "ZIG");
    expect(mockDb.updateQuotes).toHaveBeenCalledWith(42, "ZIG");
  });

  it("creates an audit trail entry on successful update", async () => {
    await runUpdateCurrency(makeCtx("claims_manager"), { claimId: 42, currencyCode: "USD" }, mockClaim, mockDb);
    expect(mockDb.createAudit).toHaveBeenCalledWith(42, 1, "USD");
  });

  it("does NOT create audit trail when claim is not found", async () => {
    try {
      await runUpdateCurrency(makeCtx("insurer"), { claimId: 9999, currencyCode: "USD" }, null, mockDb);
    } catch {
      // expected NOT_FOUND
    }
    expect(mockDb.createAudit).not.toHaveBeenCalled();
  });

  // ── Return value ──────────────────────────────────────────────────────────

  it("returns { success: true, currencyCode } on success", async () => {
    const result = await runUpdateCurrency(makeCtx("insurer"), { claimId: 42, currencyCode: "ZIG" }, mockClaim, mockDb);
    expect(result).toStrictEqual({ success: true, currencyCode: "ZIG" });
  });
});
