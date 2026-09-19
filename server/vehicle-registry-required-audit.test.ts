import { describe, expect, it, vi } from "vitest";
import { RequiredClaimEventPersistenceError } from "./db/intelligence-db";
import { persistCrossTenantContainmentAudit } from "./vehicle-registry";

describe("cross-tenant containment audit boundary", () => {
  const input = {
    claimId: 123,
    tenantId: "tenant-incoming",
    matchedBy: "vin" as const,
    existingVehicleRegistryId: 456,
    existingTenantId: "tenant-existing",
  };

  it("uses the required containment event contract", async () => {
    const emit = vi.fn().mockResolvedValue(undefined);

    await persistCrossTenantContainmentAudit(input, emit);

    expect(emit).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({
      claimId: 123,
      eventType: "vehicle_registry_cross_tenant_match_contained",
      userRole: "system",
      tenantId: "tenant-incoming",
      eventPayload: {
        matchedBy: "vin",
        existingVehicleRegistryId: 456,
        existingTenantId: "tenant-existing",
        incomingTenantId: "tenant-incoming",
        action: "claim_retained_without_registry_attachment",
      },
    });
  });

  it("propagates a required audit persistence failure without changing containment", async () => {
    const failure = new RequiredClaimEventPersistenceError(
      {
        claimId: input.claimId,
        eventType: "vehicle_registry_cross_tenant_match_contained",
      },
      new Error("connection unavailable")
    );
    const emit = vi.fn().mockRejectedValue(failure);

    await expect(persistCrossTenantContainmentAudit(input, emit)).rejects.toBe(
      failure
    );
    expect(emit).toHaveBeenCalledOnce();
  });
});
