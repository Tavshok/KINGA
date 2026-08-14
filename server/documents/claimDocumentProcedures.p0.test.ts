import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  storagePut: vi.fn(async () => ({ key: "claim-documents/701/test.pdf", url: "https://example.invalid/test.pdf" })),
  createAuditEntry: vi.fn(async () => undefined),
}));

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: mocks.getDb,
  createAuditEntry: mocks.createAuditEntry,
}));
vi.mock("../storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../storage")>()),
  storagePut: mocks.storagePut,
}));

const { appRouter } = await import("../routers");

const claim = {
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
  sourceDocumentId: null,
};

function createDb(responses: unknown[][]) {
  const next = () => responses.shift() ?? [];
  return {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => next(),
          orderBy: async () => next(),
        }),
      }),
    })),
    insert: vi.fn(() => ({ values: async () => undefined })),
    delete: vi.fn(() => ({ where: async () => undefined })),
  };
}

function caller(role: "fleet_manager" | "fleet_admin" | "fleet_driver", id: number, tenantId = "tenant-a") {
  return appRouter.createCaller({ user: { id, role, tenantId, name: "Fleet user", email: "fleet@example.test" }, req: { headers: {} } } as any);
}

describe("P0 fleet claim-document actual tRPC procedure acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permits same-tenant fleet manager and fleet administrator claim context through the actual document procedure", async () => {
    for (const role of ["fleet_manager", "fleet_admin"] as const) {
      mocks.getDb.mockResolvedValueOnce(createDb([[claim], [{ ownerId: 30, fleetId: 4 }], []]));
      await expect(caller(role, 30).documents.getClaimContext({ claimId: 701 }))
        .resolves.toMatchObject({ id: 701, vehicleRegistration: "ABC123" });
    }
  });

  it("permits the assigned active fleet driver to list and upload company-vehicle documents through actual procedures", async () => {
    mocks.getDb.mockResolvedValueOnce(createDb([
      [claim], [{ ownerId: 30, fleetId: 4 }], [{ id: 17, userId: 44, employmentStatus: "active" }], [],
    ]));
    mocks.getDb.mockResolvedValueOnce(createDb([[]]));
    await expect(caller("fleet_driver", 44).documents.byClaim({ claimId: 701 })).resolves.toEqual([]);

    mocks.getDb.mockResolvedValueOnce(createDb([
      [claim], [{ ownerId: 30, fleetId: 4 }], [{ id: 17, userId: 44, employmentStatus: "active" }],
    ]));
    mocks.getDb.mockResolvedValueOnce(createDb([]));
    await expect(caller("fleet_driver", 44).documents.upload({
      claimId: 701,
      fileName: "damage.jpg",
      fileData: "data:image/jpeg;base64,AA==",
      fileSize: 2,
      mimeType: "image/jpeg",
      documentCategory: "damage_photo",
    })).resolves.toMatchObject({ success: true });
    expect(mocks.storagePut).toHaveBeenCalledTimes(1);
  });

  it("permits the assigned active driver to use the unified document list and an uploader fleet manager to delete through actual procedures", async () => {
    mocks.getDb.mockResolvedValueOnce(createDb([
      [claim], [{ ownerId: 30, fleetId: 4 }], [{ id: 17, userId: 44, employmentStatus: "active" }],
    ]));
    mocks.getDb.mockResolvedValueOnce(createDb([[
      { id: 501, fileName: "damage.jpg", fileUrl: "https://example.invalid/damage.jpg", fileSize: 2, mimeType: "image/jpeg", documentCategory: "damage_photo", createdAt: "2026-08-13", visibleToRoles: '["fleet_driver"]' },
    ]]));
    await expect(caller("fleet_driver", 44).documents.allByClaim({ claimId: 701 }))
      .resolves.toMatchObject([{ id: 501, source: "claim_document" }]);

    mocks.getDb.mockResolvedValueOnce(createDb([[
      { id: 501, claimId: 701, uploadedBy: 30, fileName: "damage.jpg" },
    ]]));
    mocks.getDb.mockResolvedValueOnce(createDb([
      [claim], [{ ownerId: 30, fleetId: 4 }], [],
    ]));
    await expect(caller("fleet_manager", 30).documents.delete({ documentId: 501 }))
      .resolves.toEqual({ success: true });
  });

  it("denies a foreign-tenant fleet actor and an unrelated active driver through actual document procedures", async () => {
    mocks.getDb.mockResolvedValueOnce(createDb([[claim], [{ ownerId: 30, fleetId: 4 }], []]));
    await expect(caller("fleet_manager", 30, "tenant-b").documents.getClaimContext({ claimId: 701 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getDb.mockResolvedValueOnce(createDb([[claim], [{ ownerId: 30, fleetId: 4 }], [{ id: 17, userId: 45, employmentStatus: "active" }]]));
    await expect(caller("fleet_driver", 44).documents.allByClaim({ claimId: 701 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    { role: "fleet_manager" as const, id: 30, driverRows: [] as unknown[][] },
    { role: "fleet_admin" as const, id: 30, driverRows: [] as unknown[][] },
    { role: "fleet_driver" as const, id: 44, driverRows: [[{ id: 17, userId: 44, employmentStatus: "active" }]] },
  ])("permits $role through each actual procedure for its authorised company vehicle", async ({ role, id, driverRows }) => {
    const authorityRows = () => [[claim], [{ ownerId: 30, fleetId: 4 }], ...driverRows];
    const visibleDocument = { id: 501, claimId: 701, uploadedBy: id, fileName: "damage.jpg", fileUrl: "https://example.invalid/damage.jpg", fileSize: 2, mimeType: "image/jpeg", documentCategory: "damage_photo", createdAt: "2026-08-13", visibleToRoles: null };

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows()));
    await expect(caller(role, id).documents.getClaimContext({ claimId: 701 })).resolves.toMatchObject({ id: 701 });

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows()));
    mocks.getDb.mockResolvedValueOnce(createDb([[visibleDocument]]));
    await expect(caller(role, id).documents.byClaim({ claimId: 701 })).resolves.toMatchObject([{ id: 501 }]);

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows()));
    mocks.getDb.mockResolvedValueOnce(createDb([[visibleDocument]]));
    await expect(caller(role, id).documents.allByClaim({ claimId: 701 })).resolves.toMatchObject([{ id: 501, source: "claim_document" }]);

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows()));
    mocks.getDb.mockResolvedValueOnce(createDb([]));
    await expect(caller(role, id).documents.upload({
      claimId: 701,
      fileName: `${role}-evidence.jpg`,
      fileData: "data:image/jpeg;base64,AA==",
      fileSize: 2,
      mimeType: "image/jpeg",
      documentCategory: "damage_photo",
    })).resolves.toMatchObject({ success: true });

    mocks.getDb.mockResolvedValueOnce(createDb([[visibleDocument]]));
    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows()));
    await expect(caller(role, id).documents.delete({ documentId: 501 })).resolves.toEqual({ success: true });
  });

  it.each([
    { label: "a foreign-tenant fleet manager", role: "fleet_manager" as const, id: 30, tenantId: "tenant-b", authorityRows: [[claim], [{ ownerId: 30, fleetId: 4 }]] },
    { label: "an unrelated active fleet driver", role: "fleet_driver" as const, id: 44, tenantId: "tenant-a", authorityRows: [[claim], [{ ownerId: 30, fleetId: 4 }], [{ id: 17, userId: 45, employmentStatus: "active" }]] },
  ])("denies $label through actual list, upload, and delete procedures before document side effects", async ({ role, id, tenantId, authorityRows }) => {
    const deniedCaller = caller(role, id, tenantId);
    const visibleDocument = { id: 501, claimId: 701, uploadedBy: id, fileName: "damage.jpg" };

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows));
    await expect(deniedCaller.documents.byClaim({ claimId: 701 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows));
    await expect(deniedCaller.documents.upload({
      claimId: 701,
      fileName: "denied-evidence.jpg",
      fileData: "data:image/jpeg;base64,AA==",
      fileSize: 2,
      mimeType: "image/jpeg",
      documentCategory: "damage_photo",
    })).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|NOT_FOUND)$/) });
    expect(mocks.storagePut).not.toHaveBeenCalled();
    expect(mocks.createAuditEntry).not.toHaveBeenCalled();

    const documentDb = createDb([[visibleDocument]]);
    mocks.getDb.mockResolvedValueOnce(documentDb);
    mocks.getDb.mockResolvedValueOnce(createDb(authorityRows));
    await expect(deniedCaller.documents.delete({ documentId: 501 })).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|NOT_FOUND)$/) });
    expect(documentDb.delete).not.toHaveBeenCalled();
    expect(mocks.createAuditEntry).not.toHaveBeenCalled();
  });
});
