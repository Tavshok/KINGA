import { beforeEach, describe, expect, it, vi } from "vitest";

const getDbOrThrow = vi.fn();
vi.mock("../db", () => ({ getDbOrThrow }));
vi.mock("./sessionManager", () => ({ loadSession: vi.fn(), createSession: vi.fn(), saveSession: vi.fn() }));
vi.mock("./provider", () => ({ TwilioAdapter: vi.fn(), MockWhatsAppAdapter: vi.fn() }));
vi.mock("./claimJourney", () => ({ handleClaimState: vi.fn() }));
vi.mock("./otherJourneys", () => ({ handleStatusJourney: vi.fn(), handleQuoteState: vi.fn(), handleValuationState: vi.fn() }));
vi.mock("../services/canonicalClaimIntake", () => ({ persistCanonicalClaimIntake: vi.fn(), startCanonicalIntakeAssessment: vi.fn() }));

function makeDb(responses: unknown[]) {
  let response = 0;
  const select = vi.fn(() => {
    const builder: any = {
      from: () => builder,
      where: () => builder,
      limit: async () => responses[response++],
      then: (resolve: (value: unknown) => unknown) => resolve(responses[response++]),
    };
    return builder;
  });
  return { select, insert: vi.fn(() => ({ values: vi.fn(() => ({ $returningId: async () => responses[response++] })) })) };
}

describe("P0 WhatsApp claimant identity resolution", () => {
  beforeEach(() => vi.resetAllMocks());

  it("links a tenant-matched verified phone to the existing KINGA account", async () => {
    getDbOrThrow.mockResolvedValue(makeDb([
      [{ id: "tenant-old-mutual", name: "old_mutual", displayName: "Old Mutual" }],
      [{ id: 42, role: "claimant", tenantId: "tenant-old-mutual" }],
    ]));
    const { resolveWhatsAppCanonicalActor } = await import("./engine");
    await expect(resolveWhatsAppCanonicalActor("+263 77 123 4567", "Old Mutual")).resolves.toMatchObject({ id: 42, tenantId: "tenant-old-mutual", role: "claimant" });
  });

  it("creates a restricted claimant identity only in the resolved insurer tenant when no account matches", async () => {
    const db = makeDb([
      [{ id: "tenant-zimnat", name: "zimnat", displayName: "Zimnat" }], [], [], [{ id: 77 }],
    ]);
    getDbOrThrow.mockResolvedValue(db);
    const { resolveWhatsAppCanonicalActor } = await import("./engine");
    await expect(resolveWhatsAppCanonicalActor("+263771234567", "Zimnat")).resolves.toMatchObject({ id: 77, tenantId: "tenant-zimnat", role: "claimant" });
    expect(db.insert).toHaveBeenCalledOnce();
  });

  it("fails closed before identity creation when the selected insurer has no registered tenant", async () => {
    const db = makeDb([[]]);
    getDbOrThrow.mockResolvedValue(db);
    const { resolveWhatsAppCanonicalActor } = await import("./engine");
    await expect(resolveWhatsAppCanonicalActor("+263771234567", "Unknown Insurer")).rejects.toThrow("not configured");
    expect(db.insert).not.toHaveBeenCalled();
  });
});
