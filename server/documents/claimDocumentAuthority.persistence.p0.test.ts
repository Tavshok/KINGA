import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { claims, fleetDrivers, fleetVehicles } from "../../drizzle/schema";

const getDb = vi.fn();
vi.mock("../db", () => ({ getDb }));

const { getAuthorizedClaimDocumentContext } = await import("./claimDocumentAuthority");

type Rows = { claim: unknown[]; vehicle: unknown[]; driver: unknown[] };

function createNoWriteDb(rows: Rows) {
  return {
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === claims) return rows.claim;
            if (table === fleetVehicles) return rows.vehicle;
            if (table === fleetDrivers) return rows.driver;
            return [];
          },
        }),
      }),
    })),
  };
}

const companyClaim = {
  id: 701,
  tenantId: "tenant-a",
  claimantId: 11,
  fleetDriverId: 17,
  vehicleRegistration: "ABC123",
  vehicleMake: "Toyota",
  vehicleModel: "Hilux",
  vehicleYear: 2023,
  status: "submitted",
  incidentDate: null,
  sourceDocumentId: 91,
};

describe("P0 fleet claim-document no-write object authority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns authorised company-vehicle claim context for a same-tenant fleet manager", async () => {
    getDb.mockResolvedValue(createNoWriteDb({
      claim: [companyClaim],
      vehicle: [{ ownerId: 30, fleetId: 4 }],
      driver: [{ id: 17, userId: 44, employmentStatus: "active" }],
    }));
    await expect(getAuthorizedClaimDocumentContext({ id: 30, role: "fleet_manager", tenantId: "tenant-a" }, 701))
      .resolves.toMatchObject({ id: 701, sourceDocumentId: 91 });
  });

  it("denies a foreign-tenant fleet manager before document data is returned", async () => {
    getDb.mockResolvedValue(createNoWriteDb({
      claim: [companyClaim],
      vehicle: [{ ownerId: 30, fleetId: 4 }],
      driver: [],
    }));
    await expect(getAuthorizedClaimDocumentContext({ id: 30, role: "fleet_manager", tenantId: "tenant-b" }, 701))
      .rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });

  it("denies a fleet driver who is not the active driver assigned to the company claim", async () => {
    getDb.mockResolvedValue(createNoWriteDb({
      claim: [companyClaim],
      vehicle: [{ ownerId: 30, fleetId: 4 }],
      driver: [{ id: 17, userId: 45, employmentStatus: "active" }],
    }));
    await expect(getAuthorizedClaimDocumentContext({ id: 44, role: "fleet_driver", tenantId: "tenant-a" }, 701))
      .rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
  });
});
