import { afterEach, describe, expect, it, vi } from "vitest";
import { RequiredClaimEventPersistenceError } from "./db/intelligence-db";
import { handleVehicleRegistryRequiredAuditFailure } from "./vehicle-registry-audit-alert";

describe("vehicle registry required audit alert boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attempts exactly one non-PII owner alert for a required audit failure", async () => {
    const notify = vi.fn().mockResolvedValue(true);
    const error = new RequiredClaimEventPersistenceError(
      {
        claimId: 123,
        eventType: "vehicle_registry_cross_tenant_match_contained",
      },
      new Error("insert unavailable")
    );

    await handleVehicleRegistryRequiredAuditFailure(error, notify);

    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Required vehicle containment audit was not persisted",
        content: expect.stringContaining(
          "containment decision remains in effect"
        ),
      })
    );
    expect(notify.mock.calls[0][0].content).not.toMatch(
      /123|test-vr-|[A-Z0-9]{17}/i
    );
  });

  it("does not alert for ordinary best-effort registry failures", async () => {
    const notify = vi.fn().mockResolvedValue(true);
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await handleVehicleRegistryRequiredAuditFailure(
      new Error("ordinary enrichment failure"),
      notify
    );

    expect(notify).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
  });

  it("logs an undelivered required-audit alert without throwing", async () => {
    const notify = vi.fn().mockResolvedValue(false);
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const error = new RequiredClaimEventPersistenceError(
      {
        claimId: 123,
        eventType: "vehicle_registry_cross_tenant_match_contained",
      },
      new Error("insert unavailable")
    );

    await expect(
      handleVehicleRegistryRequiredAuditFailure(error, notify)
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledOnce();
  });
});
