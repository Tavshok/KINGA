/**
 * Fleet Router - tRPC procedures for Fleet Portal
 * 
 * Implements role-based access control for fleet operations:
 * - fleet_driver: Submit incident reports, upload images, update mileage, request maintenance
 * - fleet_manager: Approve service requests, view analytics, select preferred insurer
 * - fleet_admin: Full fleet management access
 */

import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "../db";
import { 
  serviceRequests, 
  vehicleMileageLogs, 
  fleets, 
  fleetVehicles,
  maintenanceRecords,
  serviceQuotes
} from "../../drizzle/schema";
import { eq, and, desc, count, sum, avg } from "drizzle-orm";
import { fetchClaimDossierData, generateClaimDossierHTML } from "../fleet-claim-export";
import {
  createFleet,
  addVehicle,
  onboardDriver,
  addMaintenanceRecord,
  getFleetDrivers,
  canManageFleet,
} from "../fleet-service";

/**
 * Fleet role validation middleware
 */
const fleetRoleProcedure = protectedProcedure.use(({ ctx, next }) => {
  const allowedRoles = ["fleet_admin", "fleet_manager", "fleet_driver"];
  
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Fleet role required.",
    });
  }

  if (!ctx.user.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Fleet association required.",
    });
  }

  return next({ ctx });
});

/**
 * Fleet manager-only procedures
 */
const fleetManagerProcedure = fleetRoleProcedure.use(({ ctx, next }) => {
  if (!["fleet_admin", "fleet_manager"].includes(ctx.user.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Fleet manager role required.",
    });
  }
  return next({ ctx });
});

/**
 * Fleet admin-only procedures
 */
const fleetAdminProcedure = fleetRoleProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "fleet_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied. Fleet admin role required.",
    });
  }
  return next({ ctx });
});

export const fleetRouter = router({
  /**
   * DRIVER CAPABILITIES
   */

  // Submit service request (maintenance, repair, emergency)
  submitServiceRequest: fleetRoleProcedure
    .input(
      z.object({
        vehicleId: z.number(),
        requestType: z.enum(["maintenance", "repair", "inspection", "emergency"]),
        serviceCategory: z.enum([
          "engine",
          "transmission",
          "brakes",
          "suspension",
          "electrical",
          "bodywork",
          "tires",
          "hvac",
          "general",
        ]),
        title: z.string(),
        description: z.string(),
        urgency: z.enum(["low", "medium", "high", "critical"]),
        currentMileage: z.number().optional(),
        problemImages: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify vehicle belongs to user's fleet
        const vehicle = await db.query.fleetVehicles.findFirst({
          where: and(
            eq(fleetVehicles.id, input.vehicleId),
            eq(fleetVehicles.tenantId, ctx.user.tenantId!)
          ),
        });

        if (!vehicle) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found or access denied",
          });
        }

        // Create service request
        const [request] = await db.insert(serviceRequests).values({
          vehicleId: input.vehicleId,
          fleetId: vehicle.fleetId,
          ownerId: ctx.user.id,
          tenantId: ctx.user.tenantId!,
          requestType: input.requestType,
          serviceCategory: input.serviceCategory,
          title: input.title,
          description: input.description,
          urgency: input.urgency,
          currentMileage: input.currentMileage,
          problemImages: input.problemImages ? JSON.stringify(input.problemImages) : null,
          submittedBy: ctx.user.id,
          status: "open",
          approvalStatus: "pending",
        });

        return {
          success: true,
          requestId: request.insertId,
          message: "Service request submitted successfully",
        };
      } catch (error) {
        console.error("Error submitting service request:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit service request",
        });
      }
    }),

  // Update vehicle mileage
  updateMileage: fleetRoleProcedure
    .input(
      z.object({
        vehicleId: z.number(),
        mileage: z.number(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify vehicle access
        const vehicle = await db.query.fleetVehicles.findFirst({
          where: and(
            eq(fleetVehicles.id, input.vehicleId),
            eq(fleetVehicles.tenantId, ctx.user.tenantId!)
          ),
        });

        if (!vehicle) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Vehicle not found or access denied",
          });
        }

        // Log mileage update
        await db.insert(vehicleMileageLogs).values({
          vehicleId: input.vehicleId,
          tenantId: ctx.user.tenantId!,
          mileage: input.mileage,
          recordedBy: ctx.user.id,
          notes: input.notes,
        });

        return {
          success: true,
          message: "Mileage updated successfully",
        };
      } catch (error) {
        console.error("Error updating mileage:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update mileage",
        });
      }
    }),

  // Get my service requests (driver view)
  getMyServiceRequests: fleetRoleProcedure.query(async ({ ctx }) => {
    try {
      const requests = await db.query.serviceRequests.findMany({
        where: and(
          eq(serviceRequests.submittedBy, ctx.user.id),
          eq(serviceRequests.tenantId, ctx.user.tenantId!)
        ),
        orderBy: [desc(serviceRequests.createdAt)],
      });

      return {
        success: true,
        data: requests,
      };
    } catch (error) {
      console.error("Error fetching service requests:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch service requests",
      });
    }
  }),

  /**
   * MANAGER CAPABILITIES
   */

  // Approve/reject service request
  approveServiceRequest: fleetManagerProcedure
    .input(
      z.object({
        requestId: z.number(),
        approved: z.boolean(),
        rejectionReason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify request belongs to manager's fleet
        const request = await db.query.serviceRequests.findFirst({
          where: and(
            eq(serviceRequests.id, input.requestId),
            eq(serviceRequests.tenantId, ctx.user.tenantId!)
          ),
        });

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Service request not found or access denied",
          });
        }

        // Update approval status
        await db
          .update(serviceRequests)
          .set({
            approvalStatus: input.approved ? "approved" : "rejected",
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
            rejectionReason: input.rejectionReason,
          })
          .where(eq(serviceRequests.id, input.requestId));

        return {
          success: true,
          message: input.approved
            ? "Service request approved"
            : "Service request rejected",
        };
      } catch (error) {
        console.error("Error approving service request:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process approval",
        });
      }
    }),

  // Get pending service requests (manager view)
  getPendingServiceRequests: fleetManagerProcedure.query(async ({ ctx }) => {
    try {
      const requests = await db.query.serviceRequests.findMany({
        where: and(
          eq(serviceRequests.tenantId, ctx.user.tenantId!),
          eq(serviceRequests.approvalStatus, "pending")
        ),
        orderBy: [desc(serviceRequests.createdAt)],
      });

      return {
        success: true,
        data: requests,
      };
    } catch (error) {
      console.error("Error fetching pending requests:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch pending requests",
      });
    }
  }),

  // Select preferred insurer
  selectPreferredInsurer: fleetManagerProcedure
    .input(
      z.object({
        fleetId: z.number(),
        insurerName: z.string(),
        insurerContact: z.string(),
        insurerId: z.number().optional(), // Only if insurer is on KINGA
        insurerIsOnKinga: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify fleet access
        const fleet = await db.query.fleets.findFirst({
          where: and(
            eq(fleets.id, input.fleetId),
            eq(fleets.tenantId, ctx.user.tenantId!)
          ),
        });

        if (!fleet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Fleet not found or access denied",
          });
        }

        // Update preferred insurer
        await db
          .update(fleets)
          .set({
            preferredInsurerName: input.insurerName,
            preferredInsurerContact: input.insurerContact,
            preferredInsurerId: input.insurerId,
            insurerIsOnKinga: input.insurerIsOnKinga ? 1 : 0,
          })
          .where(eq(fleets.id, input.fleetId));

        return {
          success: true,
          message: "Preferred insurer updated successfully",
        };
      } catch (error) {
        console.error("Error selecting insurer:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update preferred insurer",
        });
      }
    }),

  // Get fleet analytics (manager view)
  getFleetAnalytics: fleetManagerProcedure
    .input(z.object({ fleetId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        // Verify fleet access
        const fleet = await db.query.fleets.findFirst({
          where: and(
            eq(fleets.id, input.fleetId),
            eq(fleets.tenantId, ctx.user.tenantId!)
          ),
        });

        if (!fleet) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Fleet not found or access denied",
          });
        }

        // Get vehicles in fleet
        const vehicles = await db.query.fleetVehicles.findMany({
          where: and(
            eq(fleetVehicles.fleetId, input.fleetId),
            eq(fleetVehicles.tenantId, ctx.user.tenantId!)
          ),
        });

        // Get maintenance records for fleet vehicles
        const vehicleIds = vehicles.map((v) => v.id);
        const maintenanceStats = vehicleIds.length > 0
          ? await db
              .select({
                totalRecords: count(),
                totalCost: sum(maintenanceRecords.totalCost),
                avgCost: avg(maintenanceRecords.totalCost),
              })
              .from(maintenanceRecords)
              .where(eq(maintenanceRecords.tenantId, ctx.user.tenantId!))
          : [{ totalRecords: 0, totalCost: 0, avgCost: 0 }];

        return {
          success: true,
          data: {
            fleet,
            totalVehicles: vehicles.length,
            activeVehicles: vehicles.filter((v) => v.status === "active").length,
            maintenanceRecords: maintenanceStats[0].totalRecords,
            totalMaintenanceCost: maintenanceStats[0].totalCost || 0,
            avgMaintenanceCost: maintenanceStats[0].avgCost || 0,
          },
        };
      } catch (error) {
        console.error("Error fetching fleet analytics:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch fleet analytics",
        });
      }
    }),

  /**
   * FLEET GOVERNANCE FOUNDATION
   */

  // Create a new fleet (fleet_manager only)
  createFleet: fleetManagerProcedure
    .input(
      z.object({
        fleetName: z.string().min(1),
        contactEmail: z.string().email(),
        contactPhone: z.string().optional(),
        address: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User must belong to a tenant" });
      }

      return await createFleet(
        ctx.user.tenantId,
        ctx.user.id,
        input.fleetName,
        input.contactEmail,
        input.contactPhone,
        input.address
      );
    }),

  // Add a vehicle to a fleet (fleet_manager only)
  addVehicleToFleet: fleetManagerProcedure
    .input(
      z.object({
        fleetId: z.number(),
        vin: z.string().min(1),
        make: z.string().min(1),
        model: z.string().min(1),
        year: z.number(),
        licensePlate: z.string().min(1),
        registrationExpiry: z.date().optional(),
        insurancePolicyNumber: z.string().optional(),
        insuranceExpiry: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User must belong to a tenant" });
      }

      return await addVehicle(ctx.user.tenantId, input.fleetId, {
        vin: input.vin,
        make: input.make,
        model: input.model,
        year: input.year,
        licensePlate: input.licensePlate,
        registrationExpiry: input.registrationExpiry,
        insurancePolicyNumber: input.insurancePolicyNumber,
        insuranceExpiry: input.insuranceExpiry,
      });
    }),

  // Onboard a driver to a fleet (fleet_manager only)
  onboardFleetDriver: fleetManagerProcedure
    .input(
      z.object({
        fleetId: z.number(),
        userId: z.number(),
        driverLicenseNumber: z.string().min(1),
        licenseExpiry: z.date(),
        licenseClass: z.string().optional(),
        hireDate: z.date(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User must belong to a tenant" });
      }

      return await onboardDriver(ctx.user.tenantId, input.fleetId, input.userId, {
        driverLicenseNumber: input.driverLicenseNumber,
        licenseExpiry: input.licenseExpiry,
        licenseClass: input.licenseClass,
        hireDate: input.hireDate,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
      });
    }),

  // Add a maintenance record (fleet_manager only)
  addFleetMaintenanceRecord: fleetManagerProcedure
    .input(
      z.object({
        vehicleId: z.number(),
        serviceType: z.string().min(1),
        serviceDate: z.date(),
        mileage: z.number().optional(),
        cost: z.number().optional(),
        serviceProvider: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User must belong to a tenant",
        });
      }

      return await addMaintenanceRecord(ctx.user.tenantId, input.vehicleId, {
        serviceType: input.serviceType,
        serviceDate: input.serviceDate,
        mileage: input.mileage,
        cost: input.cost,
        serviceProvider: input.serviceProvider,
        notes: input.notes,
      });
    }),

  // Get all drivers in a fleet
  getFleetDriversList: fleetRoleProcedure
    .input(
      z.object({
        fleetId: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user.tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User must belong to a tenant" });
      }

      return await getFleetDrivers(ctx.user.tenantId, input.fleetId);
    }),

  /**
   * PORTABLE CLAIM EXPORT (Fleet Independence)
   */
  exportClaimDossier: fleetRoleProcedure
    .input(z.object({ claimId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Fetch claim dossier data
        const dossierData = await fetchClaimDossierData(input.claimId, ctx.user.tenantId!);

        if (!dossierData) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Claim not found or access denied",
          });
        }

        // Generate HTML for PDF conversion
        const html = generateClaimDossierHTML(dossierData);

        return {
          success: true,
          html,
          claimNumber: dossierData.claim.claimNumber,
          message: "Claim dossier generated successfully",
        };
      } catch (error) {
        console.error("Error exporting claim dossier:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to export claim dossier",
        });
      }
    }),
});
