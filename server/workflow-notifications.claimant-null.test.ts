import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));

const { notifyClaimApproval } = await import("./workflow-notifications");
const claimsCoreSource = readFileSync(
  resolve(process.cwd(), "server/routers/claims-core.ts"),
  "utf8"
);

afterEach(() => {
  vi.clearAllMocks();
});

describe("claim approval notification for an unlinked claimant", () => {
  it("suppresses claimant notification before database lookup when claimant identity is unknown", async () => {
    await expect(
      notifyClaimApproval({
        claimId: 10,
        claimNumber: "DOC-20260919-ABC12345",
        claimantId: null,
        approvedAmount: 50_000,
        selectedPanelBeater: "Test Repairer",
        tenantId: "tenant-test",
      })
    ).resolves.toBe(false);

    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.notifyOwner).not.toHaveBeenCalled();
  });

  it("passes the nullable claimant identity through the approval path without a zero sentinel", () => {
    expect(claimsCoreSource).toContain("claimantId: claim.claimantId,");
    expect(claimsCoreSource).not.toContain("claimantId: claim.claimantId ?? 0");
  });
});
