import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { claims, fleetDrivers, fleetVehicles } from "../../drizzle/schema";
import { getDb } from "../db";
import { isAdminRole } from "@shared/role-permissions";

export type ClaimDocumentActor = {
  id: number;
  role: string;
  tenantId?: string | null;
};

export type ClaimDocumentAccessFacts = {
  actor: ClaimDocumentActor;
  claim: { tenantId: string | null; claimantId: number | null; vehicleRegistration: string | null; fleetDriverId: number | null };
  fleetVehicle?: { ownerId: number; fleetId: number | null } | null;
  assignedDriver?: { id: number; userId: number; employmentStatus: string } | null;
};

/**
 * Pure, deterministic object-authority decision for claim documents.
 * Route admission is never sufficient: the matching claim, actor tenant, vehicle, and driver facts
 * must still authorize access before a document list, upload, or deletion can proceed.
 */
export function canAccessClaimDocuments(facts: ClaimDocumentAccessFacts): boolean {
  const { actor, claim, fleetVehicle, assignedDriver } = facts;
  if (!actor.tenantId || claim.tenantId !== actor.tenantId) return false;

  if (actor.role === "claimant" || actor.role === "user") return claim.claimantId === actor.id;
  if (actor.role === "fleet_driver") {
    return Boolean(
      claim.fleetDriverId
      && assignedDriver
      && assignedDriver.id === claim.fleetDriverId
      && assignedDriver.userId === actor.id
      && assignedDriver.employmentStatus === "active",
    );
  }
  if (actor.role === "fleet_manager" || actor.role === "fleet_admin") {
    return Boolean(fleetVehicle && fleetVehicle.ownerId === actor.id);
  }

  // Professional claim participants remain tenant-bound. Platform-super-admin shell admission
  // never becomes implicit cross-tenant document authority.
  return isAdminRole(actor.role as any)
    || ["insurer", "assessor", "panel_beater"].includes(actor.role);
}

export async function getAuthorizedClaimDocumentContext(actor: ClaimDocumentActor, claimId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  const rows = await db
    .select({
      id: claims.id,
      tenantId: claims.tenantId,
      claimantId: claims.claimantId,
      fleetDriverId: claims.fleetDriverId,
      vehicleRegistration: claims.vehicleRegistration,
      vehicleMake: claims.vehicleMake,
      vehicleModel: claims.vehicleModel,
      vehicleYear: claims.vehicleYear,
      status: claims.status,
      incidentDate: claims.incidentDate,
      sourceDocumentId: claims.sourceDocumentId,
    })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  const claim = rows[0];
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

  const vehicleRows = claim.vehicleRegistration
    ? await db.select({ ownerId: fleetVehicles.ownerId, fleetId: fleetVehicles.fleetId })
      .from(fleetVehicles)
      .where(and(eq(fleetVehicles.registrationNumber, claim.vehicleRegistration), eq(fleetVehicles.tenantId, claim.tenantId ?? "")))
      .limit(1)
    : [];
  const driverRows = claim.fleetDriverId
    ? await db.select({ id: fleetDrivers.id, userId: fleetDrivers.userId, employmentStatus: fleetDrivers.employmentStatus })
      .from(fleetDrivers)
      .where(eq(fleetDrivers.id, claim.fleetDriverId))
      .limit(1)
    : [];

  if (!canAccessClaimDocuments({ actor, claim, fleetVehicle: vehicleRows[0] ?? null, assignedDriver: driverRows[0] ?? null })) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to access this claim's documents" });
  }

  return claim;
}
