import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../db-core", () => ({ getDb: mocks.getDb }));

import {
  emitClaimEvent,
  emitRequiredClaimEvent,
  RequiredClaimEventPersistenceError,
} from "./intelligence-db";

const requiredEvent = {
  claimId: 123,
  eventType: "vehicle_registry_cross_tenant_match_contained",
  tenantId: "tenant-test",
  userRole: "system",
  eventPayload: { action: "claim_retained_without_registry_attachment" },
};

describe("required claim event persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects visibly when the database is unavailable", async () => {
    mocks.getDb.mockResolvedValue(null);

    await expect(emitRequiredClaimEvent(requiredEvent)).rejects.toMatchObject({
      name: "RequiredClaimEventPersistenceError",
      claimId: requiredEvent.claimId,
      eventType: requiredEvent.eventType,
    });
  });

  it("rejects visibly when database acquisition fails", async () => {
    mocks.getDb.mockRejectedValue(new Error("connection unavailable"));

    await expect(emitRequiredClaimEvent(requiredEvent)).rejects.toMatchObject({
      name: "RequiredClaimEventPersistenceError",
      claimId: requiredEvent.claimId,
      eventType: requiredEvent.eventType,
    });
  });

  it("rejects visibly when the insert fails", async () => {
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("insert unavailable")),
    });
    mocks.getDb.mockResolvedValue({ insert });

    await expect(emitRequiredClaimEvent(requiredEvent)).rejects.toBeInstanceOf(
      RequiredClaimEventPersistenceError
    );
    expect(insert).toHaveBeenCalledOnce();
  });

  it("retains best-effort behavior for ordinary claim events", async () => {
    const insert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("insert unavailable")),
    });
    mocks.getDb.mockResolvedValue({ insert });

    await expect(emitClaimEvent(requiredEvent)).resolves.toBeUndefined();
  });
});
