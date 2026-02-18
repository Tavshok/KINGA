import { getDb } from "../db";
/**
 * Fleet Maintenance Intelligence Module
 * 
 * Provides analytics and insights for fleet maintenance:
 * 1. Service interval tracking
 * 2. Cost per vehicle trends
 * 3. Downtime tracking
 * 4. Claim frequency by driver
 */


import {
  maintenanceRecords,
  maintenanceSchedules,
  fleetVehicles,
  claims,
  users,
  serviceRequests,
} from "../drizzle/schema";
import { eq, and, gte, lte, desc, count, sum, avg, sql } from "drizzle-orm";

export interface ServiceIntervalStatus {
  vehicleId: number;
  vehicleRegistration: string;
  maintenanceType: string;
  lastServiceDate: Date | null;
  lastServiceMileage: number | null;
  nextDueDate: Date | null;
  nextDueMileage: number | null;
  isOverdue: boolean;
  daysUntilDue: number | null;
  mileageUntilDue: number | null;
}

export interface VehicleCostTrend {
  vehicleId: number;
  vehicleRegistration: string;
  totalMaintenanceCost: number;
  averageCostPerService: number;
  serviceCount: number;
  costTrend: "increasing" | "decreasing" | "stable";
  last30DaysCost: number;
  last90DaysCost: number;
}

export interface VehicleDowntime {
  vehicleId: number;
  vehicleRegistration: string;
  totalDowntimeDays: number;
  downtimeIncidents: number;
  averageDowntimePerIncident: number;
  lastDowntimeDate: Date | null;
}

export interface DriverClaimFrequency {
  driverId: number;
  driverName: string;
  totalClaims: number;
  claimsLast30Days: number;
  claimsLast90Days: number;
  claimsLast365Days: number;
  riskScore: number; // 0-100, higher = more risky
}

/**
 * Track service intervals for all vehicles in a fleet
 */
export async function getServiceIntervalStatus(
  tenantId: string,
  fleetId?: number
): Promise<ServiceIntervalStatus[]> {
  try {
    // Get all maintenance schedules for the fleet
    const schedules = await db.query.maintenanceSchedules.findMany({
      where: eq(maintenanceSchedules.tenantId, tenantId),
    });

    const results: ServiceIntervalStatus[] = [];

    for (const schedule of schedules) {
      // Get vehicle info
      const vehicle = await db.query.fleetVehicles.findFirst({
        where: and(
          eq(fleetVehicles.id, schedule.vehicleId),
          eq(fleetVehicles.tenantId, tenantId),
          fleetId ? eq(fleetVehicles.fleetId, fleetId) : undefined
        ),
      });

      if (!vehicle) continue;

      // Calculate if overdue
      const now = new Date();
      let isOverdue = false;
      let daysUntilDue: number | null = null;

      if (schedule.nextDueDate) {
        const dueDate = new Date(schedule.nextDueDate);
        daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        isOverdue = daysUntilDue < 0;
      }

      // Calculate mileage until due (would need current mileage from vehicle)
      const mileageUntilDue = schedule.nextDueMileage && vehicle.currentMileage
        ? schedule.nextDueMileage - vehicle.currentMileage
        : null;

      results.push({
        vehicleId: vehicle.id,
        vehicleRegistration: vehicle.registrationNumber,
        maintenanceType: schedule.maintenanceType,
        lastServiceDate: schedule.lastServiceDate,
        lastServiceMileage: schedule.lastServiceMileage,
        nextDueDate: schedule.nextDueDate,
        nextDueMileage: schedule.nextDueMileage,
        isOverdue,
        daysUntilDue,
        mileageUntilDue,
      });
    }

    return results;
  } catch (error) {
    console.error("Error getting service interval status:", error);
    throw error;
  }
}

/**
 * Calculate cost per vehicle trends
 */
export async function getVehicleCostTrends(
  tenantId: string,
  fleetId?: number
): Promise<VehicleCostTrend[]> {
  try {
    // Get all vehicles in fleet
    const vehicles = await db.query.fleetVehicles.findMany({
      where: and(
        eq(fleetVehicles.tenantId, tenantId),
        fleetId ? eq(fleetVehicles.fleetId, fleetId) : undefined
      ),
    });

    const results: VehicleCostTrend[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (const vehicle of vehicles) {
      // Get all maintenance records for this vehicle
      const allRecords = await db.query.maintenanceRecords.findMany({
        where: and(
          eq(maintenanceRecords.vehicleId, vehicle.id),
          eq(maintenanceRecords.tenantId, tenantId)
        ),
        orderBy: [desc(maintenanceRecords.serviceDate)],
      });

      if (allRecords.length === 0) {
        results.push({
          vehicleId: vehicle.id,
          vehicleRegistration: vehicle.registrationNumber,
          totalMaintenanceCost: 0,
          averageCostPerService: 0,
          serviceCount: 0,
          costTrend: "stable",
          last30DaysCost: 0,
          last90DaysCost: 0,
        });
        continue;
      }

      // Calculate total cost
      const totalCost = allRecords.reduce((sum, r) => sum + (r.totalCost || 0), 0);
      const avgCost = totalCost / allRecords.length;

      // Calculate recent costs
      const last30DaysCost = allRecords
        .filter((r) => new Date(r.serviceDate) >= thirtyDaysAgo)
        .reduce((sum, r) => sum + (r.totalCost || 0), 0);

      const last90DaysCost = allRecords
        .filter((r) => new Date(r.serviceDate) >= ninetyDaysAgo)
        .reduce((sum, r) => sum + (r.totalCost || 0), 0);

      // Determine cost trend (simple heuristic)
      let costTrend: "increasing" | "decreasing" | "stable" = "stable";
      if (allRecords.length >= 3) {
        const recentAvg = allRecords.slice(0, 3).reduce((sum, r) => sum + (r.totalCost || 0), 0) / 3;
        const olderAvg = allRecords.slice(-3).reduce((sum, r) => sum + (r.totalCost || 0), 0) / 3;
        
        if (recentAvg > olderAvg * 1.2) {
          costTrend = "increasing";
        } else if (recentAvg < olderAvg * 0.8) {
          costTrend = "decreasing";
        }
      }

      results.push({
        vehicleId: vehicle.id,
        vehicleRegistration: vehicle.registrationNumber,
        totalMaintenanceCost: totalCost,
        averageCostPerService: avgCost,
        serviceCount: allRecords.length,
        costTrend,
        last30DaysCost,
        last90DaysCost,
      });
    }

    return results;
  } catch (error) {
    console.error("Error calculating vehicle cost trends:", error);
    throw error;
  }
}

/**
 * Track vehicle downtime
 */
export async function getVehicleDowntime(
  tenantId: string,
  fleetId?: number
): Promise<VehicleDowntime[]> {
  try {
    // Get all vehicles in fleet
    const vehicles = await db.query.fleetVehicles.findMany({
      where: and(
        eq(fleetVehicles.tenantId, tenantId),
        fleetId ? eq(fleetVehicles.fleetId, fleetId) : undefined
      ),
    });

    const results: VehicleDowntime[] = [];

    for (const vehicle of vehicles) {
      // Get service requests that caused downtime
      const downtimeRequests = await db.query.serviceRequests.findMany({
        where: and(
          eq(serviceRequests.vehicleId, vehicle.id),
          eq(serviceRequests.tenantId, tenantId),
          eq(serviceRequests.status, "completed")
        ),
      });

      let totalDowntimeDays = 0;
      let lastDowntimeDate: Date | null = null;

      for (const request of downtimeRequests) {
        if (request.createdAt && request.completedAt) {
          const downtime = Math.ceil(
            (new Date(request.completedAt).getTime() - new Date(request.createdAt).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          totalDowntimeDays += downtime;

          if (!lastDowntimeDate || new Date(request.completedAt) > lastDowntimeDate) {
            lastDowntimeDate = new Date(request.completedAt);
          }
        }
      }

      const avgDowntime = downtimeRequests.length > 0
        ? totalDowntimeDays / downtimeRequests.length
        : 0;

      results.push({
        vehicleId: vehicle.id,
        vehicleRegistration: vehicle.registrationNumber,
        totalDowntimeDays,
        downtimeIncidents: downtimeRequests.length,
        averageDowntimePerIncident: avgDowntime,
        lastDowntimeDate,
      });
    }

    return results;
  } catch (error) {
    console.error("Error tracking vehicle downtime:", error);
    throw error;
  }
}

/**
 * Track claim frequency by driver
 */
export async function getDriverClaimFrequency(
  tenantId: string,
  fleetId?: number
): Promise<DriverClaimFrequency[]> {
  try {
    // Get all drivers in the fleet
    const drivers = await db.query.users.findMany({
      where: and(
        eq(users.tenantId, tenantId),
        eq(users.role, "fleet_driver")
      ),
    });

    const results: DriverClaimFrequency[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    for (const driver of drivers) {
      // Get all claims submitted by this driver
      const allClaims = await db.query.claims.findMany({
        where: and(
          eq(claims.claimantId, driver.id),
          eq(claims.tenantId, tenantId)
        ),
      });

      const claimsLast30Days = allClaims.filter(
        (c) => new Date(c.createdAt) >= thirtyDaysAgo
      ).length;

      const claimsLast90Days = allClaims.filter(
        (c) => new Date(c.createdAt) >= ninetyDaysAgo
      ).length;

      const claimsLast365Days = allClaims.filter(
        (c) => new Date(c.createdAt) >= oneYearAgo
      ).length;

      // Calculate risk score (0-100)
      // Higher frequency = higher risk
      let riskScore = 0;
      if (claimsLast30Days > 0) riskScore += 30;
      if (claimsLast90Days > 2) riskScore += 30;
      if (claimsLast365Days > 5) riskScore += 40;
      riskScore = Math.min(riskScore, 100);

      results.push({
        driverId: driver.id,
        driverName: driver.name || "Unknown Driver",
        totalClaims: allClaims.length,
        claimsLast30Days,
        claimsLast90Days,
        claimsLast365Days,
        riskScore,
      });
    }

    // Sort by risk score descending
    return results.sort((a, b) => b.riskScore - a.riskScore);
  } catch (error) {
    console.error("Error calculating driver claim frequency:", error);
    throw error;
  }
}
