import { describe, expect, it } from "vitest";
import { canAccessClaimDocuments } from "./claimDocumentAuthority";

const claim = { tenantId: "tenant-a", claimantId: 11, vehicleRegistration: "ABC123", fleetDriverId: 17 };

describe("claim document object authority", () => {
  it("permits the claimant and same-tenant professional claim participants without crossing tenant scope", () => {
    expect(canAccessClaimDocuments({ actor: { id: 11, role: "claimant", tenantId: "tenant-a" }, claim })).toBe(true);
    expect(canAccessClaimDocuments({ actor: { id: 90, role: "insurer", tenantId: "tenant-a" }, claim })).toBe(true);
    expect(canAccessClaimDocuments({ actor: { id: 90, role: "insurer", tenantId: "tenant-b" }, claim })).toBe(false);
  });

  it("permits a fleet owner for its company vehicle but denies an unrelated fleet owner", () => {
    const actor = { id: 30, role: "fleet_manager", tenantId: "tenant-a" };
    expect(canAccessClaimDocuments({ actor, claim, fleetVehicle: { ownerId: 30, fleetId: 4 } })).toBe(true);
    expect(canAccessClaimDocuments({ actor, claim, fleetVehicle: { ownerId: 31, fleetId: 4 } })).toBe(false);
  });

  it("permits only the active driver assigned to the company claim", () => {
    const actor = { id: 44, role: "fleet_driver", tenantId: "tenant-a" };
    expect(canAccessClaimDocuments({ actor, claim, assignedDriver: { id: 17, userId: 44, employmentStatus: "active" } })).toBe(true);
    expect(canAccessClaimDocuments({ actor, claim, assignedDriver: { id: 17, userId: 45, employmentStatus: "active" } })).toBe(false);
    expect(canAccessClaimDocuments({ actor, claim, assignedDriver: { id: 17, userId: 44, employmentStatus: "suspended" } })).toBe(false);
  });
});
