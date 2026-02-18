/**
 * Fleet Management Service
 * 
 * Service layer for fleet governance operations with role-based permissions.
 * 
 * Roles:
 * - fleet_manager: Can create fleets, add vehicles, onboard drivers, review incident reports
 * - fleet_driver: Can submit incident reports, view assigned vehicles
 * 
 * Features:
 * - Driver onboarding with license validation
 * - Incident report submission and review workflow
 * - Maintenance record tracking
 * - Full tenant isolation
 * - Clear separation from insurer workflows
 */

import { getDb } from "./db";
import {
  fleets,
  fleetVehicles,
  fleetDrivers,
  fleetIncidentReports,
  maintenanceRecords,
  users,
} from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Permission check: Only fleet_manager can perform fleet management operations
 */
export function canManageFleet(userRole: string | null): boolean {
  return userRole === "fleet_manager";
}

/**
 * Permission check: Both fleet_manager and fleet_driver can submit incident reports
 */
export function canSubmitIncidentReport(userRole: string | null): boolean {
  return userRole === "fleet_manager" || userRole === "fleet_driver";
}

/**
 * Create a new fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param userId - User ID of fleet_manager creating the fleet
 * @param fleetName - Name of the fleet
 * @param contactEmail - Fleet contact email
 * @param contactPhone - Fleet contact phone
 * @param address - Fleet address
 * @returns Created fleet record
 */
export async function createFleet(
  tenantId: string,
  userId: number,
  fleetName: string,
  contactEmail: string,
  contactPhone?: string,
  address?: string
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify user is fleet_manager
  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (user.length === 0 || !canManageFleet(user[0].role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only fleet managers can create fleets",
    });
  }

  // Create fleet
  const result = await db.insert(fleets).values({
    tenantId,
    fleetName,
    contactEmail,
    contactPhone,
    address,
    ownerId: userId,
  });

  console.log(`[Fleet Service] Created fleet "${fleetName}" for tenant ${tenantId}`);

  return {
    fleetId: result.insertId,
    fleetName,
  };
}

/**
 * Add a vehicle to a fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param fleetId - Fleet ID
 * @param vehicleData - Vehicle information (VIN, make, model, etc.)
 * @returns Created vehicle record
 */
export async function addVehicle(
  tenantId: string,
  fleetId: number,
  vehicleData: {
    vin: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    registrationExpiry?: Date;
    insurancePolicyNumber?: string;
    insuranceExpiry?: Date;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify fleet exists and belongs to tenant
  const fleet = await db
    .select()
    .from(fleets)
    .where(and(eq(fleets.id, fleetId), eq(fleets.tenantId, tenantId)))
    .limit(1);

  if (fleet.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found" });
  }

  // Add vehicle
  const result = await db.insert(fleetVehicles).values({
    fleetId,
    tenantId,
    vin: vehicleData.vin,
    make: vehicleData.make,
    model: vehicleData.model,
    year: vehicleData.year,
    licensePlate: vehicleData.licensePlate,
    registrationExpiry: vehicleData.registrationExpiry,
    insurancePolicyNumber: vehicleData.insurancePolicyNumber,
    insuranceExpiry: vehicleData.insuranceExpiry,
    status: "active",
  });

  console.log(`[Fleet Service] Added vehicle ${vehicleData.vin} to fleet ${fleetId}`);

  return {
    vehicleId: result.insertId,
    vin: vehicleData.vin,
  };
}

/**
 * Onboard a driver to a fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param fleetId - Fleet ID
 * @param userId - User ID of the driver (must have fleet_driver role)
 * @param driverData - Driver information (license, hire date, etc.)
 * @returns Created driver record
 */
export async function onboardDriver(
  tenantId: string,
  fleetId: number,
  userId: number,
  driverData: {
    driverLicenseNumber: string;
    licenseExpiry: Date;
    licenseClass?: string;
    hireDate: Date;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify fleet exists and belongs to tenant
  const fleet = await db
    .select()
    .from(fleets)
    .where(and(eq(fleets.id, fleetId), eq(fleets.tenantId, tenantId)))
    .limit(1);

  if (fleet.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Fleet not found" });
  }

  // Verify user exists, belongs to tenant, and has fleet_driver role
  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  if (user.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  }

  if (user[0].role !== "fleet_driver") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "User must have fleet_driver role to be onboarded as a driver",
    });
  }

  // Check if driver already exists
  const existingDriver = await db
    .select()
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.userId, userId), eq(fleetDrivers.tenantId, tenantId)))
    .limit(1);

  if (existingDriver.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Driver already onboarded",
    });
  }

  // Onboard driver
  const result = await db.insert(fleetDrivers).values({
    fleetId,
    tenantId,
    userId,
    driverLicenseNumber: driverData.driverLicenseNumber,
    licenseExpiry: driverData.licenseExpiry,
    licenseClass: driverData.licenseClass,
    hireDate: driverData.hireDate,
    employmentStatus: "active",
    emergencyContactName: driverData.emergencyContactName,
    emergencyContactPhone: driverData.emergencyContactPhone,
  });

  console.log(`[Fleet Service] Onboarded driver ${user[0].name} to fleet ${fleetId}`);

  return {
    driverId: result.insertId,
    userName: user[0].name,
  };
}

/**
 * Submit an incident report
 * 
 * @param tenantId - Tenant ID for isolation
 * @param driverId - Driver ID submitting the report
 * @param incidentData - Incident details
 * @returns Created incident report record
 */
export async function submitIncidentReport(
  tenantId: string,
  driverId: number,
  incidentData: {
    vehicleId: number;
    incidentDate: Date;
    location: string;
    description: string;
    severity: "minor" | "moderate" | "major" | "critical";
    policeReportNumber?: string;
    witnessName?: string;
    witnessPhone?: string;
    estimatedDamage?: number;
    vehicleDriveable?: boolean;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify driver exists and belongs to tenant
  const driver = await db
    .select()
    .from(fleetDrivers)
    .where(and(eq(fleetDrivers.id, driverId), eq(fleetDrivers.tenantId, tenantId)))
    .limit(1);

  if (driver.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Driver not found" });
  }

  // Verify vehicle exists and belongs to same fleet
  const vehicle = await db
    .select()
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.id, incidentData.vehicleId),
        eq(fleetVehicles.fleetId, driver[0].fleetId),
        eq(fleetVehicles.tenantId, tenantId)
      )
    )
    .limit(1);

  if (vehicle.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found or not in driver's fleet" });
  }

  // Submit incident report
  const result = await db.insert(fleetIncidentReports).values({
    vehicleId: incidentData.vehicleId,
    driverId,
    fleetId: driver[0].fleetId,
    tenantId,
    incidentDate: incidentData.incidentDate,
    location: incidentData.location,
    description: incidentData.description,
    severity: incidentData.severity,
    status: "submitted",
    policeReportNumber: incidentData.policeReportNumber,
    witnessName: incidentData.witnessName,
    witnessPhone: incidentData.witnessPhone,
    estimatedDamage: incidentData.estimatedDamage?.toString(),
    vehicleDriveable: incidentData.vehicleDriveable ? 1 : 0,
  });

  console.log(
    `[Fleet Service] Incident report submitted for vehicle ${incidentData.vehicleId} by driver ${driverId}`
  );

  return {
    incidentReportId: result.insertId,
    status: "submitted",
  };
}

/**
 * Add a maintenance record for a vehicle
 * 
 * @param tenantId - Tenant ID for isolation
 * @param vehicleId - Vehicle ID
 * @param maintenanceData - Maintenance details
 * @returns Created maintenance record
 */
export async function addMaintenanceRecord(
  tenantId: string,
  vehicleId: number,
  maintenanceData: {
    serviceType: string;
    serviceDate: Date;
    mileage?: number;
    cost?: number;
    serviceProvider?: string;
    notes?: string;
  }
): Promise<any> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Verify vehicle exists and belongs to tenant
  const vehicle = await db
    .select()
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.id, vehicleId), eq(fleetVehicles.tenantId, tenantId)))
    .limit(1);

  if (vehicle.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Vehicle not found" });
  }

  // Add maintenance record
  const result = await db.insert(maintenanceRecords).values({
    vehicleId,
    fleetId: vehicle[0].fleetId,
    tenantId,
    serviceType: maintenanceData.serviceType,
    serviceDate: maintenanceData.serviceDate,
    mileage: maintenanceData.mileage,
    cost: maintenanceData.cost?.toString(),
    serviceProvider: maintenanceData.serviceProvider,
    notes: maintenanceData.notes,
    status: "completed",
  });

  console.log(`[Fleet Service] Maintenance record added for vehicle ${vehicleId}`);

  return {
    maintenanceRecordId: result.insertId,
    serviceType: maintenanceData.serviceType,
  };
}

/**
 * Get all vehicles in a fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param fleetId - Fleet ID
 * @returns List of vehicles
 */
export async function getFleetVehicles(tenantId: string, fleetId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const vehicles = await db
    .select()
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.fleetId, fleetId), eq(fleetVehicles.tenantId, tenantId)))
    .orderBy(desc(fleetVehicles.createdAt));

  return vehicles;
}

/**
 * Get all drivers in a fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param fleetId - Fleet ID
 * @returns List of drivers with user information
 */
export async function getFleetDrivers(tenantId: string, fleetId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const drivers = await db
    .select({
      id: fleetDrivers.id,
      userId: fleetDrivers.userId,
      userName: users.name,
      userEmail: users.email,
      driverLicenseNumber: fleetDrivers.driverLicenseNumber,
      licenseExpiry: fleetDrivers.licenseExpiry,
      licenseClass: fleetDrivers.licenseClass,
      hireDate: fleetDrivers.hireDate,
      employmentStatus: fleetDrivers.employmentStatus,
      emergencyContactName: fleetDrivers.emergencyContactName,
      emergencyContactPhone: fleetDrivers.emergencyContactPhone,
      createdAt: fleetDrivers.createdAt,
    })
    .from(fleetDrivers)
    .leftJoin(users, eq(fleetDrivers.userId, users.id))
    .where(and(eq(fleetDrivers.fleetId, fleetId), eq(fleetDrivers.tenantId, tenantId)))
    .orderBy(desc(fleetDrivers.createdAt));

  return drivers;
}

/**
 * Get maintenance history for a vehicle
 * 
 * @param tenantId - Tenant ID for isolation
 * @param vehicleId - Vehicle ID
 * @returns List of maintenance records
 */
export async function getMaintenanceHistory(tenantId: string, vehicleId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const records = await db
    .select()
    .from(maintenanceRecords)
    .where(and(eq(maintenanceRecords.vehicleId, vehicleId), eq(maintenanceRecords.tenantId, tenantId)))
    .orderBy(desc(maintenanceRecords.serviceDate));

  return records;
}

/**
 * Get incident reports for a fleet
 * 
 * @param tenantId - Tenant ID for isolation
 * @param fleetId - Fleet ID
 * @param status - Optional status filter
 * @returns List of incident reports
 */
export async function getIncidentReports(
  tenantId: string,
  fleetId: number,
  status?: string
): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  let query = db
    .select({
      id: fleetIncidentReports.id,
      vehicleId: fleetIncidentReports.vehicleId,
      driverId: fleetIncidentReports.driverId,
      incidentDate: fleetIncidentReports.incidentDate,
      location: fleetIncidentReports.location,
      description: fleetIncidentReports.description,
      severity: fleetIncidentReports.severity,
      status: fleetIncidentReports.status,
      policeReportNumber: fleetIncidentReports.policeReportNumber,
      estimatedDamage: fleetIncidentReports.estimatedDamage,
      vehicleDriveable: fleetIncidentReports.vehicleDriveable,
      reviewedBy: fleetIncidentReports.reviewedBy,
      reviewedAt: fleetIncidentReports.reviewedAt,
      reviewNotes: fleetIncidentReports.reviewNotes,
      createdAt: fleetIncidentReports.createdAt,
      vehicleMake: fleetVehicles.make,
      vehicleModel: fleetVehicles.model,
      vehicleLicensePlate: fleetVehicles.licensePlate,
      driverName: users.name,
    })
    .from(fleetIncidentReports)
    .leftJoin(fleetVehicles, eq(fleetIncidentReports.vehicleId, fleetVehicles.id))
    .leftJoin(fleetDrivers, eq(fleetIncidentReports.driverId, fleetDrivers.id))
    .leftJoin(users, eq(fleetDrivers.userId, users.id))
    .where(and(eq(fleetIncidentReports.fleetId, fleetId), eq(fleetIncidentReports.tenantId, tenantId)));

  if (status) {
    query = query.where(eq(fleetIncidentReports.status, status as any));
  }

  const reports = await query.orderBy(desc(fleetIncidentReports.createdAt));

  return reports;
}
