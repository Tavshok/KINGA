import { getDb } from "../db";
import { fleetVehicles, maintenanceSchedules, maintenanceRecords } from "../../drizzle/schema";
import { eq, and, lt, gte, sql } from "drizzle-orm";

/**
 * Maintenance Intelligence Engine
 * Predicts maintenance needs, tracks service intervals, and calculates compliance scores
 */

export interface MaintenanceAlert {
  vehicleId: number;
  registrationNumber: string;
  make: string;
  model: string;
  alertType: "overdue" | "due_soon" | "upcoming";
  serviceType: string;
  dueDate: Date | null;
  dueMileage: number | null;
  currentMileage: number | null;
  daysOverdue?: number;
  priority: "high" | "medium" | "low";
}

export interface ComplianceScore {
  vehicleId: number;
  score: number; // 0-100
  overdueServices: number;
  upcomingServices: number;
  lastServiceDate: Date | null;
  averageServiceInterval: number; // days
}

/**
 * Calculate maintenance compliance score for a vehicle
 * Based on service history, overdue maintenance, and adherence to schedule
 */
export async function calculateComplianceScore(vehicleId: number): Promise<ComplianceScore> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all maintenance schedules for this vehicle
  const schedules = await db
    .select()
    .from(maintenanceSchedules)
    .where(eq(maintenanceSchedules.vehicleId, vehicleId));

  // Get maintenance records
  const records = await db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.vehicleId, vehicleId))
    .orderBy(sql`${maintenanceRecords.serviceDate} DESC`);

  const now = new Date();
  let overdueServices = 0;
  let upcomingServices = 0;
  let totalScore = 100;

  // Check each schedule for compliance
  for (const schedule of schedules) {
    if (schedule.nextDueDate && schedule.nextDueDate < now) {
      overdueServices++;
      const daysOverdue = Math.floor((now.getTime() - schedule.nextDueDate.getTime()) / (1000 * 60 * 60 * 24));
      // Deduct points based on how overdue (max 20 points per overdue service)
      totalScore -= Math.min(20, daysOverdue / 7 * 5);
    } else if (schedule.nextDueDate) {
      const daysUntilDue = Math.floor((schedule.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue <= 30) {
        upcomingServices++;
      }
    }
  }

  // Calculate average service interval
  let averageInterval = 90; // default 90 days
  if (records.length >= 2) {
    const intervals: number[] = [];
    for (let i = 0; i < records.length - 1; i++) {
      const days = Math.floor(
        (records[i].serviceDate.getTime() - records[i + 1].serviceDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(days);
    }
    averageInterval = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  }

  // Bonus points for regular maintenance
  if (records.length > 0) {
    const lastServiceDays = Math.floor((now.getTime() - records[0].serviceDate.getTime()) / (1000 * 60 * 60 * 24));
    if (lastServiceDays < averageInterval) {
      totalScore += 5; // Bonus for recent service
    }
  }

  return {
    vehicleId,
    score: Math.max(0, Math.min(100, Math.round(totalScore))),
    overdueServices,
    upcomingServices,
    lastServiceDate: records.length > 0 ? records[0].serviceDate : null,
    averageServiceInterval: averageInterval,
  };
}

/**
 * Get maintenance alerts for a vehicle or fleet
 */
export async function getMaintenanceAlerts(
  vehicleId?: number,
  fleetId?: number
): Promise<MaintenanceAlert[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Build query conditions
  let conditions = [];
  if (vehicleId) {
    conditions.push(eq(maintenanceSchedules.vehicleId, vehicleId));
  }
  if (fleetId) {
    conditions.push(eq(fleetVehicles.fleetId, fleetId));
  }

  // Get schedules with vehicle info
  const schedules = await db
    .select({
      schedule: maintenanceSchedules,
      vehicle: fleetVehicles,
    })
    .from(maintenanceSchedules)
    .innerJoin(fleetVehicles, eq(maintenanceSchedules.vehicleId, fleetVehicles.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const alerts: MaintenanceAlert[] = [];

  for (const { schedule, vehicle } of schedules) {
    if (!schedule.nextDueDate) continue;

    const daysUntilDue = Math.floor(
      (schedule.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    let alertType: "overdue" | "due_soon" | "upcoming";
    let priority: "high" | "medium" | "low";

    if (daysUntilDue < 0) {
      alertType = "overdue";
      priority = Math.abs(daysUntilDue) > 14 ? "high" : "medium";
    } else if (daysUntilDue <= 7) {
      alertType = "due_soon";
      priority = "high";
    } else if (daysUntilDue <= 30) {
      alertType = "upcoming";
      priority = "medium";
    } else {
      continue; // Skip if more than 30 days away
    }

    alerts.push({
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      make: vehicle.make,
      model: vehicle.model,
      alertType,
      serviceType: schedule.maintenanceType,
      dueDate: schedule.nextDueDate,
      dueMileage: schedule.nextDueMileage,
      currentMileage: 0, // Will be populated from vehicle_mileage_logs if needed
      daysOverdue: daysUntilDue < 0 ? Math.abs(daysUntilDue) : undefined,
      priority,
    });
  }

  // Sort by priority and due date
  alerts.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (a.dueDate && b.dueDate) {
      return a.dueDate.getTime() - b.dueDate.getTime();
    }
    return 0;
  });

  return alerts;
}

/**
 * Create or update maintenance schedule for a vehicle
 */
export async function createMaintenanceSchedule(data: {
  vehicleId: number;
  serviceType: string;
  intervalMileage?: number | null;
  intervalDays?: number | null;
  lastServiceDate?: Date | null;
  lastServiceMileage?: number | null;
  nextDueDate?: Date | null;
  nextDueMileage?: number | null;
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(maintenanceSchedules).values({
    vehicleId: data.vehicleId,
    maintenanceType: data.serviceType as any,
    intervalType: "both",
    mileageInterval: data.intervalMileage || null,
    timeInterval: data.intervalDays || null,
    lastServiceDate: data.lastServiceDate || null,
    lastServiceMileage: data.lastServiceMileage || null,
    nextDueDate: data.nextDueDate || null,
    nextDueMileage: data.nextDueMileage || null,
    isActive: true,
    tenantId: data.tenantId,
  });

  return result;
}

/**
 * Record a completed maintenance service
 */
export async function recordMaintenanceService(data: {
  vehicleId: number;
  serviceType: string;
  serviceDate: Date;
  mileageAtService: number | null;
  serviceProvider: string;
  cost: number; // in cents
  description: string | null;
  nextServiceDue: Date | null;
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Record the service
  const result = await db.insert(maintenanceRecords).values({
    vehicleId: data.vehicleId,
    serviceType: data.serviceType,
    serviceDate: data.serviceDate,
    mileageAtService: data.mileageAtService,
    serviceProvider: data.serviceProvider,
    cost: data.cost,
    description: data.description,
    nextServiceDue: data.nextServiceDue,
    tenantId: data.tenantId,
  });

  // Update the maintenance schedule
  if (data.nextServiceDue) {
    await db
      .update(maintenanceSchedules)
      .set({
        lastServiceDate: data.serviceDate,
        lastServiceMileage: data.mileageAtService,
        nextDueDate: data.nextServiceDue,
        nextDueMileage: data.mileageAtService
          ? data.mileageAtService + (await getIntervalMileage(data.vehicleId, data.serviceType))
          : null,
      })
      .where(
        and(
          eq(maintenanceSchedules.vehicleId, data.vehicleId),
          eq(maintenanceSchedules.maintenanceType, data.serviceType)
        )
      );
  }

  // Recalculate compliance score
  const compliance = await calculateComplianceScore(data.vehicleId);
  await db
    .update(fleetVehicles)
    .set({ maintenanceComplianceScore: compliance.score })
    .where(eq(fleetVehicles.id, data.vehicleId));

  return result;
}

/**
 * Get interval mileage for a service type
 */
async function getIntervalMileage(vehicleId: number, serviceType: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const schedule = await db
    .select()
    .from(maintenanceSchedules)
    .where(
      and(
        eq(maintenanceSchedules.vehicleId, vehicleId),
        eq(maintenanceSchedules.maintenanceType, serviceType)
      )
    )
    .limit(1);

  return schedule[0]?.mileageInterval || 10000; // Default 10,000 km
}

/**
 * Get maintenance history for a vehicle
 */
export async function getMaintenanceHistory(vehicleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(maintenanceRecords)
    .where(eq(maintenanceRecords.vehicleId, vehicleId))
    .orderBy(sql`${maintenanceRecords.serviceDate} DESC`);
}

/**
 * Get all maintenance schedules for a vehicle
 */
export async function getVehicleMaintenanceSchedules(vehicleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(maintenanceSchedules)
    .where(eq(maintenanceSchedules.vehicleId, vehicleId));
}

/**
 * Update vehicle mileage and trigger maintenance checks
 */
export async function updateVehicleMileage(vehicleId: number, newMileage: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Note: currentMileage tracking would require adding a mileage_logs table
  // For now, we skip the mileage update

  // Check if any maintenance is due based on mileage
  const schedules = await db
    .select()
    .from(maintenanceSchedules)
    .where(
      and(
        eq(maintenanceSchedules.vehicleId, vehicleId),
        sql`${maintenanceSchedules.isActive} = 1`
      )
    );

  for (const schedule of schedules) {
    if (schedule.nextDueMileage && newMileage >= schedule.nextDueMileage) {
      // Maintenance is due - could trigger notification here
      console.log(`Maintenance due for vehicle ${vehicleId}: ${schedule.serviceType}`);
    }
  }

  return { success: true };
}
