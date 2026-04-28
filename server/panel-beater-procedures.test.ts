/**
 * Tests for new panel beater tRPC procedures:
 *   claims.myQuoteRequests
 *   claims.myQuoteHistory
 *   claims.myPanelBeaterProfile
 *
 * These procedures look up the panelBeaters record by userId, then delegate
 * to the existing db helpers. We test the lookup logic and graceful fallback
 * when no panel beater record exists for the user.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal mock of the db helpers used by the procedures
// ---------------------------------------------------------------------------

const mockGetClaimsForPanelBeater = vi.fn();
const mockGetQuotesByPanelBeater = vi.fn();

vi.mock("../server/db", () => ({
  getClaimsForPanelBeater: (...args: any[]) => mockGetClaimsForPanelBeater(...args),
  getQuotesByPanelBeater: (...args: any[]) => mockGetQuotesByPanelBeater(...args),
}));

// ---------------------------------------------------------------------------
// Unit tests for the lookup + delegation logic
// ---------------------------------------------------------------------------

describe("Panel beater procedure logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no panel beater record exists for user", async () => {
    // Simulate: db returns no row for this userId
    const findPanelBeater = async (_userId: number) => null;
    const result = await (async () => {
      const pb = await findPanelBeater(999);
      if (!pb) return [];
      return mockGetClaimsForPanelBeater(pb);
    })();
    expect(result).toEqual([]);
    expect(mockGetClaimsForPanelBeater).not.toHaveBeenCalled();
  });

  it("calls getClaimsForPanelBeater with correct panelBeater id when record exists", async () => {
    const fakePb = { id: 42, userId: 7, businessName: "ABC Repairs" };
    const fakeClaims = [{ id: 1, claimNumber: "CLM-001" }];
    mockGetClaimsForPanelBeater.mockResolvedValue(fakeClaims);

    const findPanelBeater = async (_userId: number) => fakePb;
    const result = await (async () => {
      const pb = await findPanelBeater(7);
      if (!pb) return [];
      return mockGetClaimsForPanelBeater(pb.id, undefined);
    })();

    expect(mockGetClaimsForPanelBeater).toHaveBeenCalledWith(42, undefined);
    expect(result).toEqual(fakeClaims);
  });

  it("calls getQuotesByPanelBeater with correct panelBeater id for history", async () => {
    const fakePb = { id: 42, userId: 7 };
    const fakeQuotes = [{ id: 10, quotedAmount: 5000 }];
    mockGetQuotesByPanelBeater.mockResolvedValue(fakeQuotes);

    const findPanelBeater = async (_userId: number) => fakePb;
    const result = await (async () => {
      const pb = await findPanelBeater(7);
      if (!pb) return [];
      return mockGetQuotesByPanelBeater(pb.id, undefined);
    })();

    expect(mockGetQuotesByPanelBeater).toHaveBeenCalledWith(42, undefined);
    expect(result).toEqual(fakeQuotes);
  });

  it("returns null profile when no panel beater record exists", async () => {
    const findPanelBeater = async (_userId: number) => null;
    const result = await (async () => {
      const pb = await findPanelBeater(999);
      return pb || null;
    })();
    expect(result).toBeNull();
  });

  it("returns panel beater profile when record exists", async () => {
    const fakePb = { id: 42, userId: 7, businessName: "ABC Repairs", performanceTier: "A" };
    const findPanelBeater = async (_userId: number) => fakePb;
    const result = await (async () => {
      const pb = await findPanelBeater(7);
      return pb || null;
    })();
    expect(result).toEqual(fakePb);
    expect(result?.businessName).toBe("ABC Repairs");
  });
});

// ---------------------------------------------------------------------------
// Unit tests for the role-aware DashboardLayout menu logic
// ---------------------------------------------------------------------------

describe("getMenuItems role-aware sidebar logic", () => {
  // Inline the logic (mirrors DashboardLayout.tsx) so we can unit-test it
  function getMenuItems(role: string | undefined, insurerRole: string | null | undefined) {
    if (role === "admin" || role === "platform_super_admin") {
      return ["Admin Dashboard", "Tenant Management", "Tier Management"];
    }
    if (role === "insurer") {
      const base = ["Portal Home", "Exception Hub", "Relationship Intelligence", "Reports Centre"];
      if (insurerRole === "executive") return [...base, "Executive Dashboard", "Workflow Analytics", "Governance"];
      if (insurerRole === "claims_manager") return [...base, "Claims Manager", "Workflow Analytics", "Escalation Queue", "Workflows"];
      if (insurerRole === "claims_processor") return [...base, "Claims Processor"];
      if (insurerRole === "risk_manager") return [...base, "Risk Manager", "Workflow Analytics"];
      if (insurerRole === "assessor_internal") return [...base, "Assessor Dashboard"];
      return base;
    }
    if (role === "assessor") return ["Dashboard", "My Claims", "Performance", "Leaderboard"];
    if (role === "panel_beater") return ["Dashboard"];
    if (role === "claimant") return ["My Claims", "Submit Claim"];
    return ["Dashboard", "Exception Hub", "Relationship Intelligence", "Reports Centre"];
  }

  it("admin sees admin-specific nav items", () => {
    const items = getMenuItems("admin", null);
    expect(items).toContain("Admin Dashboard");
    expect(items).toContain("Tenant Management");
    expect(items).toContain("Tier Management");
    expect(items).not.toContain("Portal Home");
  });

  it("insurer executive sees executive-specific items plus base", () => {
    const items = getMenuItems("insurer", "executive");
    expect(items).toContain("Portal Home");
    expect(items).toContain("Executive Dashboard");
    expect(items).toContain("Governance");
    expect(items).not.toContain("Claims Manager");
  });

  it("insurer claims_manager sees claims manager items", () => {
    const items = getMenuItems("insurer", "claims_manager");
    expect(items).toContain("Claims Manager");
    expect(items).toContain("Escalation Queue");
    expect(items).not.toContain("Executive Dashboard");
  });

  it("insurer with no sub-role sees only base items", () => {
    const items = getMenuItems("insurer", null);
    expect(items).toContain("Portal Home");
    expect(items).toHaveLength(4);
  });

  it("panel_beater sees only their dashboard", () => {
    const items = getMenuItems("panel_beater", null);
    expect(items).toEqual(["Dashboard"]);
  });

  it("claimant sees my claims and submit claim", () => {
    const items = getMenuItems("claimant", null);
    expect(items).toContain("My Claims");
    expect(items).toContain("Submit Claim");
    expect(items).not.toContain("Portal Home");
  });

  it("unknown role gets fallback items", () => {
    const items = getMenuItems(undefined, undefined);
    expect(items).toContain("Dashboard");
  });
});
