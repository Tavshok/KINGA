/**
 * Fleet Router
 * ─────────────────────────────
 * Extracted from server/routers.ts (TECH-02: router file split, Aug 2026)
 * Handles fleet vehicle management, driver operations, and fleet analytics.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { eq, and, desc, asc, inArray, gte, lte, or, sql, count } from "drizzle-orm";
import {
  fleetVehicles, fleetDrivers, fleetRiskScores, fleets, users, claims, aiAssessments as aiAssessmentsTable,
  auditTrail, notifications
} from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { isAdminRole } from "@shared/role-permissions";

type FleetActor = { id: number; role: string; tenantId?: string | null };

function requireFleetTenant(actor: FleetActor): string {
  if (!actor.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required." });
  }
  return actor.tenantId;
}

function isFleetManagerActor(actor: FleetActor): boolean {
  return ["fleet_manager", "fleet_admin"].includes(actor.role) || isAdminRole(actor.role);
}

async function requireManagedFleet(db: any, actor: FleetActor, fleetId: number) {
  if (!isFleetManagerActor(actor)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Fleet manager access is required." });
  }
  const tenantId = requireFleetTenant(actor);
  const [fleet] = await db.select().from(fleets)
    .where(and(eq(fleets.id, fleetId), eq(fleets.tenantId, tenantId))).limit(1);
  if (!fleet) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found or access denied." });
  return fleet;
}

async function requireFleetReadAccess(db: any, actor: FleetActor, fleetId: number) {
  if (isFleetManagerActor(actor)) return requireManagedFleet(db, actor, fleetId);
  if (actor.role !== "fleet_driver") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Authorised fleet access is required." });
  }
  const [assignment] = await db
    .select({ fleetId: fleetDrivers.fleetId })
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.fleetId, fleetId), eq(fleetDrivers.userId, actor.id), eq(fleetDrivers.employmentStatus, "active"), eq(fleetDrivers.tenantId, requireFleetTenant(actor))))
    .limit(1);
  if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found or access denied." });
  const [fleet] = await db.select().from(fleets).where(and(eq(fleets.id, fleetId), eq(fleets.tenantId, requireFleetTenant(actor)))).limit(1);
  if (!fleet) throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found or access denied." });
  return fleet;
}

async function requireManagedVehicle(db: any, actor: FleetActor, vehicleId: number) {
  const tenantId = requireFleetTenant(actor);
  const [vehicle] = await db.select().from(fleetVehicles)
    .where(and(eq(fleetVehicles.id, vehicleId), eq(fleetVehicles.tenantId, tenantId))).limit(1);
  if (!vehicle?.fleetId) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found or access denied." });
  await requireManagedFleet(db, actor, vehicle.fleetId);
  return vehicle;
}

export const fleetCoreRouter = router({
  // Create a new fleet
  createFleet: protectedProcedure
    .input(z.object({
      name: z.string(),
      description: z.string().optional(),
      businessType: z.enum(["logistics", "mining", "agriculture", "public_transport", "corporate", "rental"]),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isFleetManagerActor(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a fleet manager or administrator can create a fleet." });
      }
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required." });
      const { createFleet } = await import('../fleet/fleet-db');
      
      const fleet = await createFleet({
        fleetName: input.name,
        description: input.description || null,
        fleetType: input.businessType,
        ownerId: ctx.user.id,
        tenantId,
      });
      
      return fleet;
    }),

  // Get fleets owned by current user
  getMyFleets: protectedProcedure
    .query(async ({ ctx }) => {
      const { getFleetsByOwner } = await import('../fleet/fleet-db');
      const tenantId = requireFleetTenant(ctx.user);
      return (await getFleetsByOwner(ctx.user.id)).filter((fleet: { tenantId?: string | null }) => fleet.tenantId === tenantId);
    }),

  // Get fleet by ID
  getFleetById: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return requireFleetReadAccess(db, ctx.user, input.id);
    }),

  // Register a single vehicle
  onboardFleetDriver: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
      userId: z.number().int().positive().optional(),
      driverEmail: z.string().email().optional(),
      driverLicenseNumber: z.string(),
      licenseExpiry: z.string().optional(),
      licenseClass: z.string().optional(),
      hireDate: z.string().optional(),
      emergencyContactName: z.string().optional(),
      emergencyContactPhone: z.string().optional(),
    }).refine((input) => Boolean(input.userId || input.driverEmail), {
      message: "Provide a registered Fleet Driver account email or user ID.",
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const fleet = await requireManagedFleet(db, ctx.user, input.fleetId);

      const [driverUser] = input.userId
        ? await db.select({ id: users.id, email: users.email, role: users.role, tenantId: users.tenantId }).from(users).where(eq(users.id, input.userId)).limit(1)
        : await db.select({ id: users.id, email: users.email, role: users.role, tenantId: users.tenantId }).from(users).where(eq(users.email, input.driverEmail!)).limit(1);
      if (!driverUser) throw new TRPCError({ code: "NOT_FOUND", message: "No registered user was found for that driver account." });
      if (driverUser.role !== "fleet_driver") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The selected account must have the Fleet Driver role before it can be assigned." });
      }
      if (fleet.tenantId && driverUser.tenantId && fleet.tenantId !== driverUser.tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "The driver account belongs to a different tenant." });
      }

      const [existingAssignment] = await db
        .select({ id: fleetDrivers.id })
        .from(fleetDrivers)
        .where(and(eq(fleetDrivers.fleetId, input.fleetId), eq(fleetDrivers.userId, driverUser.id)))
        .limit(1);
      if (existingAssignment) {
        throw new TRPCError({ code: "CONFLICT", message: "This driver is already assigned to the selected fleet." });
      }

      const [result] = await db.insert(fleetDrivers).values({
        fleetId: input.fleetId,
        tenantId: fleet.tenantId ?? ctx.user.tenantId ?? '',
        userId: driverUser.id,
        driverLicenseNumber: input.driverLicenseNumber,
        licenseExpiry: input.licenseExpiry || new Date().toISOString().split('T')[0],
        licenseClass: input.licenseClass || null,
        hireDate: input.hireDate || new Date().toISOString().split('T')[0],
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
      }).$returningId();
      const driverId = (result as any).id ?? (result as any)[0]?.insertId ?? null;
      await db.insert(auditTrail).values({
        userId: ctx.user.id,
        action: "FLEET_DRIVER_ASSIGNED",
        entityType: "fleet_driver",
        entityId: String(driverId),
        changeDescription: `Assigned Fleet Driver ${driverUser.email ?? `user #${driverUser.id}`} to ${fleet.fleetName}.`,
      } as any);
      return { success: true, driverId, driverUserId: driverUser.id };
    }),
  registerVehicle: protectedProcedure
    .input(z.object({
      fleetId: z.number().optional(),
      registrationNumber: z.string(),
      vin: z.string().optional(),
      make: z.string(),
      model: z.string(),
      year: z.number(),
      engineCapacity: z.number().optional(),
      vehicleMass: z.number().optional(),
      color: z.string().optional(),
      fuelType: z.enum(["petrol", "diesel", "electric", "hybrid"]).optional(),
      transmissionType: z.enum(["manual", "automatic"]).optional(),
      usageType: z.enum(["private", "commercial", "logistics", "mining", "agriculture", "public_transport"]).optional(),
      primaryUse: z.string().optional(),
      averageMonthlyMileage: z.number().optional(),
      currentInsurer: z.string().optional(),
      policyNumber: z.string().optional(),
      policyStartDate: z.string().optional(),
      policyEndDate: z.string().optional(),
      coverageType: z.enum(["comprehensive", "third_party", "third_party_fire_theft"]).optional(),
      purchasePrice: z.number().optional(),
      purchaseDate: z.string().optional(),
      currentValuation: z.number().optional(),
      replacementValue: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isFleetManagerActor(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a fleet manager or administrator can register a vehicle." });
      }
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (input.fleetId) await requireManagedFleet(db, ctx.user, input.fleetId);
      const { createFleetVehicle } = await import('../fleet/fleet-db');
      
      const vehicle = await createFleetVehicle({
        ...input,
        ownerId: ctx.user.id,
        tenantId,
        policyStartDate: input.policyStartDate ? new Date(input.policyStartDate) : null,
        policyEndDate: input.policyEndDate ? new Date(input.policyEndDate) : null,
        purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : null,
        purchasePrice: input.purchasePrice ? Math.round(input.purchasePrice * 100) : null,
        currentValuation: input.currentValuation ? Math.round(input.currentValuation * 100) : null,
        replacementValue: input.replacementValue ? Math.round(input.replacementValue * 100) : null,
        status: "active",
        riskScore: 50,
        maintenanceComplianceScore: 70,
      });
      
      return vehicle;
    }),

  // Get vehicles for a fleet
  getFleetVehicles: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireFleetReadAccess(db, ctx.user, input.fleetId);
      return db.select().from(fleetVehicles).where(eq(fleetVehicles.fleetId, input.fleetId));
    }),

  // Get all vehicles owned by current user
  getMyVehicles: protectedProcedure
    .query(async ({ ctx }) => {
      const { getFleetVehiclesByOwner } = await import('../fleet/fleet-db');
      return getFleetVehiclesByOwner(ctx.user.id);
    }),

  /**
   * Tenant-scoped management intelligence. Costs are normalised to cents and
   * matched only to managed fleet registration numbers, never to a broad
   * claimant portfolio. This keeps Fleet Management distinct from My Portal.
   */
  getManagerIntelligence: protectedProcedure
    .input(z.object({
      periodDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).default(365),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }).superRefine((input, validation) => {
      if ((input.startDate && !input.endDate) || (!input.startDate && input.endDate)) {
        validation.addIssue({ code: z.ZodIssueCode.custom, message: "Provide both a start and end date for a custom analysis period." });
      }
      if (input.startDate && input.endDate && new Date(input.startDate) > new Date(input.endDate)) {
        validation.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date must be after start date." });
      }
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      if (!isFleetManagerActor(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Fleet management intelligence is available to authorised managers only." });
      }

      const fleetScope = await db.select({ id: fleets.id, tenantId: fleets.tenantId, fleetName: fleets.fleetName }).from(fleets)
        .where(ctx.user.tenantId
          ? or(eq(fleets.ownerId, ctx.user.id), eq(fleets.tenantId, ctx.user.tenantId))
          : eq(fleets.ownerId, ctx.user.id));

      const fleetIds = fleetScope.map((fleet) => fleet.id);
      if (fleetIds.length === 0) {
        return {
          summary: { periodDays: input.periodDays, totalClaims: 0, openClaims: 0, totalCostCents: 0, averageCostCents: 0, highRiskVehicleCount: 0, highRiskDriverCount: 0 },
          vehicleInsights: [],
          driverInsights: [],
        };
      }

      const vehicles = await db.select({
        id: fleetVehicles.id,
        fleetId: fleetVehicles.fleetId,
        registrationNumber: fleetVehicles.registrationNumber,
        make: fleetVehicles.make,
        model: fleetVehicles.model,
        year: fleetVehicles.year,
        riskScore: fleetVehicles.riskScore,
        maintenanceComplianceScore: fleetVehicles.maintenanceComplianceScore,
      }).from(fleetVehicles).where(inArray(fleetVehicles.fleetId, fleetIds));

      const registrations = vehicles.map((vehicle) => vehicle.registrationNumber).filter(Boolean);
      if (registrations.length === 0) {
        return {
          summary: { periodDays: input.periodDays, totalClaims: 0, openClaims: 0, totalCostCents: 0, averageCostCents: 0, highRiskVehicleCount: 0, highRiskDriverCount: 0 },
          vehicleInsights: [],
          driverInsights: [],
        };
      }

      const startDate = input.startDate ? new Date(input.startDate) : new Date();
      if (!input.startDate) startDate.setDate(startDate.getDate() - input.periodDays);
      const endDate = input.endDate ? new Date(input.endDate) : new Date();
      const tenantIds = [...new Set(fleetScope.map((fleet) => fleet.tenantId).filter((tenantId): tenantId is string => Boolean(tenantId)))];
      const claimConditions = [
        inArray(claims.vehicleRegistration, registrations),
        gte(claims.createdAt, startDate.toISOString()),
        lte(claims.createdAt, endDate.toISOString()),
      ];
      if (tenantIds.length > 0) claimConditions.push(inArray(claims.tenantId, tenantIds));
      const matchedClaims = await db.select({
	        id: claims.id,
	        claimantId: claims.claimantId,
	        fleetDriverId: claims.fleetDriverId,
        vehicleRegistration: claims.vehicleRegistration,
        status: claims.status,
        estimatedCost: claims.estimatedCost,
        approvedAmount: claims.approvedAmount,
        finalApprovedAmount: claims.finalApprovedAmount,
        estimatedClaimValue: claims.estimatedClaimValue,
        createdAt: claims.createdAt,
      }).from(claims).where(and(...claimConditions));

      const riskScores = await db.select({ vehicleId: fleetRiskScores.vehicleId, overallRiskScore: fleetRiskScores.overallRiskScore, claimsRisk: fleetRiskScores.claimsRisk, repairCostRisk: fleetRiskScores.repairCostRisk })
        .from(fleetRiskScores).where(inArray(fleetRiskScores.vehicleId, vehicles.map((vehicle) => vehicle.id)));
      const riskByVehicle = new Map(riskScores.map((risk) => [risk.vehicleId, risk]));

      const drivers = await db.select({
        driverId: fleetDrivers.id,
        fleetId: fleetDrivers.fleetId,
        userId: fleetDrivers.userId,
        userName: users.name,
        userEmail: users.email,
      }).from(fleetDrivers)
        .leftJoin(users, eq(fleetDrivers.userId, users.id))
        .where(and(inArray(fleetDrivers.fleetId, fleetIds), eq(fleetDrivers.employmentStatus, "active")));

      const claimCostCents = (claim: typeof matchedClaims[number]) => {
        if (Number(claim.estimatedCost ?? 0) > 0) return Number(claim.estimatedCost);
        if (Number(claim.approvedAmount ?? 0) > 0) return Number(claim.approvedAmount);
        return Math.round(Number(claim.finalApprovedAmount ?? claim.estimatedClaimValue ?? 0) * 100);
      };
      const openStatuses = new Set(["submitted", "triage", "assessment_pending", "assessment_in_progress", "quotes_pending", "comparison", "repair_assigned", "repair_in_progress", "intake_pending", "assessment_complete", "document_validating", "document_ready", "analysis_running", "analysis_complete", "recovery_attempted", "human_review_required"]);
      const claimsByRegistration = new Map<string, typeof matchedClaims>();
      for (const claim of matchedClaims) {
        const key = claim.vehicleRegistration ?? "";
        const items = claimsByRegistration.get(key) ?? [];
        items.push(claim);
        claimsByRegistration.set(key, items);
      }
      const claimsByDriver = new Map<number, typeof matchedClaims>();
      for (const claim of matchedClaims) {
        if (!claim.claimantId) continue;
	        const driverKey = claim.fleetDriverId ?? claim.claimantId;
	        const items = claimsByDriver.get(driverKey) ?? [];
	        items.push(claim);
	        claimsByDriver.set(driverKey, items);
      }

      const averageFrequency = matchedClaims.length / Math.max(vehicles.length, 1);
      const elevatedFrequencyThreshold = Math.max(2, Math.ceil(averageFrequency * 2));
      const vehicleInsights = vehicles.map((vehicle) => {
        const vehicleClaims = claimsByRegistration.get(vehicle.registrationNumber) ?? [];
        const risk = riskByVehicle.get(vehicle.id);
        const riskScore = risk?.overallRiskScore ?? vehicle.riskScore ?? 0;
        const totalCostCents = vehicleClaims.reduce((total, claim) => total + claimCostCents(claim), 0);
        const elevatedFrequency = vehicleClaims.length >= elevatedFrequencyThreshold;
        return {
          vehicleId: vehicle.id,
          fleetId: vehicle.fleetId,
          registrationNumber: vehicle.registrationNumber,
          vehicle: `${vehicle.make} ${vehicle.model}`,
          year: vehicle.year,
          claimCount: vehicleClaims.length,
          openClaimCount: vehicleClaims.filter((claim) => openStatuses.has(claim.status)).length,
          totalCostCents,
          riskScore,
          claimsRisk: risk?.claimsRisk ?? null,
          repairCostRisk: risk?.repairCostRisk ?? null,
          maintenanceComplianceScore: vehicle.maintenanceComplianceScore ?? null,
          elevatedFrequency,
          highRisk: riskScore >= 70 || elevatedFrequency,
        };
      }).sort((left, right) => right.totalCostCents - left.totalCostCents || right.claimCount - left.claimCount);

      const driverInsights = drivers.map((driver) => {
        const driverClaims = claimsByDriver.get(driver.driverId) ?? claimsByDriver.get(driver.userId) ?? [];
        const totalCostCents = driverClaims.reduce((total, claim) => total + claimCostCents(claim), 0);
        const elevatedFrequency = driverClaims.length >= elevatedFrequencyThreshold;
        return {
          driverId: driver.driverId,
          fleetId: driver.fleetId,
          userId: driver.userId,
          name: driver.userName ?? driver.userEmail ?? `Driver #${driver.userId}`,
          email: driver.userEmail ?? null,
          claimCount: driverClaims.length,
          openClaimCount: driverClaims.filter((claim) => openStatuses.has(claim.status)).length,
          totalCostCents,
          elevatedFrequency,
        };
      }).sort((left, right) => right.totalCostCents - left.totalCostCents || right.claimCount - left.claimCount);

      const totalCostCents = matchedClaims.reduce((total, claim) => total + claimCostCents(claim), 0);
      const periodBuckets = new Map<string, { claimCount: number; totalCostCents: number }>();
      for (const claim of matchedClaims) {
        const bucket = String(claim.createdAt).slice(0, 7);
        const current = periodBuckets.get(bucket) ?? { claimCount: 0, totalCostCents: 0 };
        current.claimCount += 1;
        current.totalCostCents += claimCostCents(claim);
        periodBuckets.set(bucket, current);
      }
      return {
        summary: {
          periodDays: input.periodDays,
          totalClaims: matchedClaims.length,
          openClaims: matchedClaims.filter((claim) => openStatuses.has(claim.status)).length,
          totalCostCents,
          averageCostCents: matchedClaims.length ? Math.round(totalCostCents / matchedClaims.length) : 0,
          highRiskVehicleCount: vehicleInsights.filter((vehicle) => vehicle.highRisk).length,
          highRiskDriverCount: driverInsights.filter((driver) => driver.elevatedFrequency).length,
        },
        vehicleInsights,
        driverInsights,
        timeSeries: [...periodBuckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([period, values]) => ({ period, ...values })),
      };
    }),

  // Download import template
  downloadImportTemplate: protectedProcedure
    .mutation(async () => {
      const { generateImportTemplate } = await import('../fleet/bulk-import-export');
      const buffer = generateImportTemplate();
      return {
        data: buffer.toString('base64'),
        filename: 'vehicle-import-template.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }),

  // Bulk import vehicles from Excel/CSV
  bulkImportVehicles: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
      fileData: z.string(), // base64 encoded file
      mimeType: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const tenantId = ctx.user.tenantId;
      if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "A tenant-scoped session is required." });
      await requireManagedFleet(db, ctx.user, input.fleetId);
      const { parseVehicleFile, importVehicles } = await import('../fleet/bulk-import-export');
      
      // Decode base64 file data
      const fileBuffer = Buffer.from(input.fileData, 'base64');
      
      // Parse file
      const vehicles = await parseVehicleFile(fileBuffer, input.mimeType);
      
      // Import vehicles
      const result = await importVehicles(
        vehicles,
        input.fleetId,
        ctx.user.id,
        tenantId
      );
      
      return result;
    }),

  // Export fleet vehicles to Excel
  exportFleetToExcel: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { exportFleetVehiclesToExcel } = await import('../fleet/bulk-import-export');
      
      const buffer = await exportFleetVehiclesToExcel(input.fleetId);
      
      return {
        data: buffer.toString('base64'),
        filename: `fleet-${input.fleetId}-vehicles.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }),

  // Export fleet vehicles to CSV
  exportFleetToCSV: protectedProcedure
    .input(z.object({
      fleetId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { exportFleetVehiclesToCSV } = await import('../fleet/bulk-import-export');
      
      const buffer = await exportFleetVehiclesToCSV(input.fleetId);
      
      return {
        data: buffer.toString('base64'),
        filename: `fleet-${input.fleetId}-vehicles.csv`,
        mimeType: 'text/csv',
      };
    }),

  // Get vehicle by ID
  getVehicleById: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [vehicle] = await db.select().from(fleetVehicles).where(eq(fleetVehicles.id, input.id)).limit(1);
      if (!vehicle) throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
      await requireFleetReadAccess(db, ctx.user, vehicle.fleetId);
      return vehicle;
    }),

  // Update vehicle
  updateVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        registrationNumber: z.string().optional(),
        make: z.string().optional(),
        model: z.string().optional(),
        year: z.number().optional(),
        color: z.string().optional(),
        status: z.enum(["active", "inactive", "sold", "written_off", "under_repair"]).optional(),
        currentValuation: z.number().optional(),
        replacementValue: z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { updateFleetVehicle } = await import('../fleet/fleet-db');
      
      // Convert prices to cents if provided
      const updateData = {
        ...input.data,
        currentValuation: input.data.currentValuation ? Math.round(input.data.currentValuation * 100) : undefined,
        replacementValue: input.data.replacementValue ? Math.round(input.data.replacementValue * 100) : undefined,
      };
      
      return updateFleetVehicle(input.id, updateData);
    }),

  // Delete vehicle
  deleteVehicle: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { deleteFleetVehicle } = await import('../fleet/fleet-db');
      await deleteFleetVehicle(input.id);
      return { success: true };
    }),

  // Maintenance Intelligence Procedures

  // Get maintenance alerts for a vehicle or fleet
  getMaintenanceAlerts: protectedProcedure
    .input(z.object({
      vehicleId: z.number().optional(),
      fleetId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const { getMaintenanceAlerts } = await import('../fleet/maintenance-intelligence');
      return getMaintenanceAlerts(input.vehicleId, input.fleetId);
    }),

  // Get compliance score for a vehicle
  getComplianceScore: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
    }))
    .query(async ({ input }) => {
      const { calculateComplianceScore } = await import('../fleet/maintenance-intelligence');
      return calculateComplianceScore(input.vehicleId);
    }),

  // Create maintenance schedule
  createMaintenanceSchedule: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      serviceType: z.string(),
      intervalMileage: z.number().optional(),
      intervalDays: z.number().optional(),
      lastServiceDate: z.string().optional(),
      lastServiceMileage: z.number().optional(),
      nextDueDate: z.string().optional(),
      nextDueMileage: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createMaintenanceSchedule } = await import('../fleet/maintenance-intelligence');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireManagedVehicle(db, ctx.user, input.vehicleId);
      
      return createMaintenanceSchedule({
        vehicleId: input.vehicleId,
        serviceType: input.serviceType,
        intervalMileage: input.intervalMileage,
        intervalDays: input.intervalDays,
        lastServiceDate: input.lastServiceDate ? new Date(input.lastServiceDate) : undefined,
        lastServiceMileage: input.lastServiceMileage,
        nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : undefined,
        nextDueMileage: input.nextDueMileage,
        tenantId: requireFleetTenant(ctx.user),
      });
    }),

  // Record maintenance service
  recordMaintenanceService: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      serviceType: z.string(),
      serviceDate: z.string(),
      mileageAtService: z.number().optional(),
      serviceProvider: z.string(),
      cost: z.number(),
      description: z.string().optional(),
      nextServiceDue: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { recordMaintenanceService } = await import('../fleet/maintenance-intelligence');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireManagedVehicle(db, ctx.user, input.vehicleId);
      
      return recordMaintenanceService({
        vehicleId: input.vehicleId,
        serviceType: input.serviceType,
        serviceDate: new Date(input.serviceDate),
        mileageAtService: input.mileageAtService || null,
        serviceProvider: input.serviceProvider,
        cost: Math.round(input.cost * 100), // Convert to cents
        description: input.description || null,
        nextServiceDue: input.nextServiceDue ? new Date(input.nextServiceDue) : null,
        tenantId: requireFleetTenant(ctx.user),
      });
    }),

  // Get maintenance history
  getMaintenanceHistory: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
    }))
    .query(async ({ input }) => {
      const { getMaintenanceHistory } = await import('../fleet/maintenance-intelligence');
      return getMaintenanceHistory(input.vehicleId);
    }),

  // Get vehicle maintenance schedules
  getVehicleMaintenanceSchedules: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
    }))
    .query(async ({ input }) => {
      const { getVehicleMaintenanceSchedules } = await import('../fleet/maintenance-intelligence');
      return getVehicleMaintenanceSchedules(input.vehicleId);
    }),

  // Update vehicle mileage
  updateVehicleMileage: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      newMileage: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { updateVehicleMileage } = await import('../fleet/maintenance-intelligence');
      return updateVehicleMileage(input.vehicleId, input.newMileage);
    }),

  // Service Quote Marketplace Procedures

  // Create service request
  createServiceRequest: protectedProcedure
    .input(z.object({
      vehicleId: z.number(),
      serviceType: z.string(),
      priority: z.enum(["low", "medium", "high", "urgent"]),
      description: z.string(),
      preferredDate: z.string().optional(),
      budget: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createServiceRequest } = await import('../fleet/service-marketplace');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await requireManagedVehicle(db, ctx.user, input.vehicleId);
      
      return createServiceRequest({
        vehicleId: input.vehicleId,
        ownerId: ctx.user.id,
        serviceType: input.serviceType,
        priority: input.priority,
        description: input.description,
        preferredDate: input.preferredDate ? new Date(input.preferredDate) : undefined,
        budget: input.budget ? Math.round(input.budget * 100) : undefined,
        tenantId: requireFleetTenant(ctx.user),
      });
    }),

  // Get service requests
  getServiceRequests: protectedProcedure
    .input(z.object({
      vehicleId: z.number().optional(),
      fleetId: z.number().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { getServiceRequests } = await import('../fleet/service-marketplace');
      return getServiceRequests(requireFleetTenant(ctx.user), input.vehicleId, input.fleetId);
    }),

  // Submit service quote
  submitServiceQuote: protectedProcedure
    .input(z.object({
      serviceRequestId: z.number(),
      providerId: z.number(),
      providerName: z.string(),
      quotedPrice: z.number(),
      estimatedDuration: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { submitServiceQuote } = await import('../fleet/service-marketplace');
      
      return submitServiceQuote({
        requestId: input.serviceRequestId,
        providerId: input.providerId,
        providerName: input.providerName,
        quotedAmount: Math.round(input.quotedPrice * 100),
        estimatedDuration: input.estimatedDuration,
        tenantId: requireFleetTenant(ctx.user),
      });
    }),

  // Get service quotes
  getServiceQuotes: protectedProcedure
    .input(z.object({
      serviceRequestId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const { getServiceQuotes } = await import('../fleet/service-marketplace');
      return getServiceQuotes(requireFleetTenant(ctx.user), input.serviceRequestId);
    }),

  // Accept service quote
  acceptServiceQuote: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { acceptServiceQuote } = await import('../fleet/service-marketplace');
      return acceptServiceQuote(requireFleetTenant(ctx.user), input.quoteId);
    }),

  // Register service provider
  registerServiceProvider: protectedProcedure
    .input(z.object({
      name: z.string(),
      contactEmail: z.string(),
      contactPhone: z.string(),
      address: z.string(),
      serviceTypes: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { registerServiceProvider } = await import('../fleet/service-marketplace');
      
      return registerServiceProvider({
        name: input.name,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        address: input.address,
        serviceTypes: input.serviceTypes,
        tenantId: requireFleetTenant(ctx.user),
      });
    }),

  // Get service providers
  getServiceProviders: protectedProcedure
    .query(async () => {
      const { getServiceProviders } = await import('../fleet/service-marketplace');
      return getServiceProviders();
    }),

  // Complete service request
  completeServiceRequest: protectedProcedure
    .input(z.object({
      serviceRequestId: z.number(),
      rating: z.number().min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      const { completeServiceRequest } = await import('../fleet/service-marketplace');
      return completeServiceRequest(requireFleetTenant(ctx.user), input.serviceRequestId, input.rating);
    }),

  /** Get all drivers for a specific fleet */
  getFleetDrivers: protectedProcedure
    .input(z.object({ fleetId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const fleet = await requireFleetReadAccess(db, ctx.user, input.fleetId);
      const tenantId = requireFleetTenant(ctx.user);
      const { users } = await import('../../drizzle/schema');
      const drivers = await db
        .select({
          id: fleetDrivers.id,
          fleetId: fleetDrivers.fleetId,
          userId: fleetDrivers.userId,
          driverLicenseNumber: fleetDrivers.driverLicenseNumber,
          licenseExpiry: fleetDrivers.licenseExpiry,
          licenseClass: fleetDrivers.licenseClass,
          hireDate: fleetDrivers.hireDate,
          emergencyContactName: fleetDrivers.emergencyContactName,
          emergencyContactPhone: fleetDrivers.emergencyContactPhone,
          createdAt: fleetDrivers.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(fleetDrivers)
        .leftJoin(users, eq(fleetDrivers.userId, users.id))
        .where(and(
          eq(fleetDrivers.fleetId, input.fleetId),
          eq(fleetDrivers.tenantId, tenantId),
        ));
      return drivers;
    }),

  /** Get all drivers across all fleets owned by the current user */
  getMyDrivers: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const { users, fleets } = await import('../../drizzle/schema');
      const tenantId = requireFleetTenant(ctx.user);
      const myFleets = await db
        .select({ id: fleets.id, fleetName: fleets.fleetName })
        .from(fleets)
        .where(and(eq(fleets.ownerId, ctx.user.id), eq(fleets.tenantId, tenantId)));
      if (!myFleets.length) return [];
      const fleetIds = myFleets.map((f: any) => f.id);
      const allDrivers = await db
        .select({
          id: fleetDrivers.id,
          fleetId: fleetDrivers.fleetId,
          userId: fleetDrivers.userId,
          driverLicenseNumber: fleetDrivers.driverLicenseNumber,
          licenseExpiry: fleetDrivers.licenseExpiry,
          licenseClass: fleetDrivers.licenseClass,
          hireDate: fleetDrivers.hireDate,
          emergencyContactName: fleetDrivers.emergencyContactName,
          emergencyContactPhone: fleetDrivers.emergencyContactPhone,
          createdAt: fleetDrivers.createdAt,
          userName: users.name,
          userEmail: users.email,
          fleetName: fleets.fleetName,
        })
        .from(fleetDrivers)
        .leftJoin(users, eq(fleetDrivers.userId, users.id))
        .leftJoin(fleets, eq(fleetDrivers.fleetId, fleets.id))
        .where(eq(fleetDrivers.tenantId, tenantId));
      return allDrivers.filter((d: any) => fleetIds.includes(d.fleetId));
    }),

  // Driver-only worklist. This deliberately excludes the fleet-manager
  // portfolio view and exposes only fleets where the current user is assigned.
  getMyDriverWorkspace: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (ctx.user.role !== "fleet_driver") {
        throw new TRPCError({ code: "FORBIDDEN", message: "This workspace is available to assigned Fleet Driver accounts." });
      }

      const assignments = await db
        .select({
          driverId: fleetDrivers.id,
          fleetId: fleetDrivers.fleetId,
          fleetName: fleets.fleetName,
          licenseExpiry: fleetDrivers.licenseExpiry,
          licenseClass: fleetDrivers.licenseClass,
          employmentStatus: fleetDrivers.employmentStatus,
        })
        .from(fleetDrivers)
        .innerJoin(fleets, eq(fleetDrivers.fleetId, fleets.id))
        .where(and(eq(fleetDrivers.userId, ctx.user.id), eq(fleetDrivers.employmentStatus, "active")));

      const fleetIds = assignments.map((assignment) => assignment.fleetId);
      const vehicles = fleetIds.length
        ? await db.select().from(fleetVehicles).where(inArray(fleetVehicles.fleetId, fleetIds)).limit(100)
        : [];
      const recentClaims = await db
        .select({
          id: claims.id,
          claimNumber: claims.claimNumber,
          status: claims.status,
          workflowState: claims.workflowState,
          incidentDate: claims.incidentDate,
          vehicleMake: claims.vehicleMake,
          vehicleModel: claims.vehicleModel,
        })
        .from(claims)
        .where(eq(claims.claimantId, ctx.user.id))
        .orderBy(desc(claims.createdAt))
        .limit(20);

      return { assignments, vehicles, recentClaims };
    }),
});
