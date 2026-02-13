import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  fleets,
  fleetVehicles,
  fleetDocuments,
  maintenanceSchedules,
  maintenanceRecords,
  maintenanceAlerts,
  serviceRequests,
  serviceQuotes,
  serviceProviders,
  fleetRiskScores,
  fleetAuditLogs,
  vehicleMileageLogs,
  type Fleet,
  type InsertFleet,
  type FleetDocument,
  type InsertFleetDocument,
  type MaintenanceSchedule,
  type InsertMaintenanceSchedule,
  type MaintenanceRecord,
  type InsertMaintenanceRecord,
  type MaintenanceAlert,
  type InsertMaintenanceAlert,
  type ServiceRequest,
  type InsertServiceRequest,
  type ServiceQuote,
  type InsertServiceQuote,
  type ServiceProvider,
  type InsertServiceProvider,
  type FleetRiskScore,
  type InsertFleetRiskScore,
  type FleetAuditLog,
  type InsertFleetAuditLog,
} from "../../drizzle/schema";

// ============================================================================
// FLEET OPERATIONS
// ============================================================================

export async function createFleet(data: InsertFleet): Promise<Fleet> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(fleets).values(data);
  const fleetId = result[0].insertId;
  
  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, fleetId));
  return fleet;
}

export async function getFleetById(id: number): Promise<Fleet | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [fleet] = await db.select().from(fleets).where(eq(fleets.id, id));
  return fleet;
}

export async function getFleetsByOwner(ownerId: number): Promise<Fleet[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleets).where(eq(fleets.ownerId, ownerId));
}

export async function updateFleet(id: number, data: Partial<InsertFleet>): Promise<Fleet | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(fleets).set(data).where(eq(fleets.id, id));
  return getFleetById(id);
}

export async function deleteFleet(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.delete(fleets).where(eq(fleets.id, id));
}

// ============================================================================
// FLEET VEHICLE OPERATIONS
// ============================================================================

export async function createFleetVehicle(data: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(fleetVehicles).values(data);
  const vehicleId = result[0].insertId;
  
  const [vehicle] = await db.select().from(fleetVehicles).where(eq(fleetVehicles.id, vehicleId));
  return vehicle;
}

export async function getFleetVehicleById(id: number): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [vehicle] = await db.select().from(fleetVehicles).where(eq(fleetVehicles.id, id));
  return vehicle;
}

export async function getFleetVehiclesByFleetId(fleetId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleetVehicles).where(eq(fleetVehicles.fleetId, fleetId));
}

export async function getFleetVehiclesByOwner(ownerId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleetVehicles).where(eq(fleetVehicles.ownerId, ownerId));
}

export async function updateFleetVehicle(id: number, data: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(fleetVehicles).set(data).where(eq(fleetVehicles.id, id));
  return getFleetVehicleById(id);
}

export async function deleteFleetVehicle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.delete(fleetVehicles).where(eq(fleetVehicles.id, id));
}

export async function bulkCreateFleetVehicles(vehicles: any[]): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(fleetVehicles).values(vehicles);
  return result[0].affectedRows || 0;
}

// ============================================================================
// FLEET DOCUMENT OPERATIONS
// ============================================================================

export async function createFleetDocument(data: InsertFleetDocument): Promise<FleetDocument> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(fleetDocuments).values(data);
  const docId = result[0].insertId;
  
  const [document] = await db.select().from(fleetDocuments).where(eq(fleetDocuments.id, docId));
  return document;
}

export async function getFleetDocumentsByVehicle(vehicleId: number): Promise<FleetDocument[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleetDocuments).where(eq(fleetDocuments.vehicleId, vehicleId));
}

export async function getFleetDocumentsByFleet(fleetId: number): Promise<FleetDocument[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleetDocuments).where(eq(fleetDocuments.fleetId, fleetId));
}

// ============================================================================
// MAINTENANCE SCHEDULE OPERATIONS
// ============================================================================

export async function createMaintenanceSchedule(data: InsertMaintenanceSchedule): Promise<MaintenanceSchedule> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(maintenanceSchedules).values(data);
  const scheduleId = result[0].insertId;
  
  const [schedule] = await db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, scheduleId));
  return schedule;
}

export async function getMaintenanceSchedulesByVehicle(vehicleId: number): Promise<MaintenanceSchedule[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.vehicleId, vehicleId));
}

export async function updateMaintenanceSchedule(id: number, data: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(maintenanceSchedules).set(data).where(eq(maintenanceSchedules.id, id));
  
  const [schedule] = await db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
  return schedule;
}

// ============================================================================
// MAINTENANCE RECORD OPERATIONS
// ============================================================================

export async function createMaintenanceRecord(data: InsertMaintenanceRecord): Promise<MaintenanceRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(maintenanceRecords).values(data);
  const recordId = result[0].insertId;
  
  const [record] = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.id, recordId));
  return record;
}

export async function getMaintenanceRecordsByVehicle(vehicleId: number): Promise<MaintenanceRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(maintenanceRecords)
    .where(eq(maintenanceRecords.vehicleId, vehicleId))
    .orderBy(desc(maintenanceRecords.serviceDate));
}

export async function getMaintenanceRecordsByFleet(fleetId: number): Promise<MaintenanceRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // Join with fleet_vehicles to get records for all vehicles in fleet
  return db.select({
    id: maintenanceRecords.id,
    vehicleId: maintenanceRecords.vehicleId,
    scheduleId: maintenanceRecords.scheduleId,
    tenantId: maintenanceRecords.tenantId,
    serviceDate: maintenanceRecords.serviceDate,
    serviceMileage: maintenanceRecords.serviceMileage,
    serviceType: maintenanceRecords.serviceType,
    serviceProvider: maintenanceRecords.serviceProvider,
    serviceLocation: maintenanceRecords.serviceLocation,
    laborCost: maintenanceRecords.laborCost,
    partsCost: maintenanceRecords.partsCost,
    totalCost: maintenanceRecords.totalCost,
    serviceItems: maintenanceRecords.serviceItems,
    partsReplaced: maintenanceRecords.partsReplaced,
    invoiceUrl: maintenanceRecords.invoiceUrl,
    serviceReportUrl: maintenanceRecords.serviceReportUrl,
    isCompliant: maintenanceRecords.isCompliant,
    wasOverdue: maintenanceRecords.wasOverdue,
    daysOverdue: maintenanceRecords.daysOverdue,
    performedBy: maintenanceRecords.performedBy,
    recordedBy: maintenanceRecords.recordedBy,
    createdAt: maintenanceRecords.createdAt,
  })
    .from(maintenanceRecords)
    .innerJoin(fleetVehicles, eq(maintenanceRecords.vehicleId, fleetVehicles.id))
    .where(eq(fleetVehicles.fleetId, fleetId))
    .orderBy(desc(maintenanceRecords.serviceDate));
}

// ============================================================================
// MAINTENANCE ALERT OPERATIONS
// ============================================================================

export async function createMaintenanceAlert(data: InsertMaintenanceAlert): Promise<MaintenanceAlert> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(maintenanceAlerts).values(data);
  const alertId = result[0].insertId;
  
  const [alert] = await db.select().from(maintenanceAlerts).where(eq(maintenanceAlerts.id, alertId));
  return alert;
}

export async function getMaintenanceAlertsByVehicle(vehicleId: number): Promise<MaintenanceAlert[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(maintenanceAlerts)
    .where(eq(maintenanceAlerts.vehicleId, vehicleId))
    .orderBy(desc(maintenanceAlerts.createdAt));
}

export async function getPendingMaintenanceAlerts(ownerId: number): Promise<MaintenanceAlert[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // Get all pending alerts for vehicles owned by this user
  return db.select({
    id: maintenanceAlerts.id,
    vehicleId: maintenanceAlerts.vehicleId,
    scheduleId: maintenanceAlerts.scheduleId,
    tenantId: maintenanceAlerts.tenantId,
    alertType: maintenanceAlerts.alertType,
    severity: maintenanceAlerts.severity,
    title: maintenanceAlerts.title,
    message: maintenanceAlerts.message,
    dueDate: maintenanceAlerts.dueDate,
    dueMileage: maintenanceAlerts.dueMileage,
    status: maintenanceAlerts.status,
    acknowledgedBy: maintenanceAlerts.acknowledgedBy,
    acknowledgedAt: maintenanceAlerts.acknowledgedAt,
    resolvedAt: maintenanceAlerts.resolvedAt,
    createdAt: maintenanceAlerts.createdAt,
  })
    .from(maintenanceAlerts)
    .innerJoin(fleetVehicles, eq(maintenanceAlerts.vehicleId, fleetVehicles.id))
    .where(and(
      eq(fleetVehicles.ownerId, ownerId),
      eq(maintenanceAlerts.status, "pending")
    ))
    .orderBy(desc(maintenanceAlerts.severity), desc(maintenanceAlerts.createdAt));
}

export async function updateMaintenanceAlert(id: number, data: Partial<InsertMaintenanceAlert>): Promise<MaintenanceAlert | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(maintenanceAlerts).set(data).where(eq(maintenanceAlerts.id, id));
  
  const [alert] = await db.select().from(maintenanceAlerts).where(eq(maintenanceAlerts.id, id));
  return alert;
}

// ============================================================================
// SERVICE REQUEST OPERATIONS
// ============================================================================

export async function createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(serviceRequests).values(data);
  const requestId = result[0].insertId;
  
  const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId));
  return request;
}

export async function getServiceRequestById(id: number): Promise<ServiceRequest | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [request] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id));
  return request;
}

export async function getServiceRequestsByOwner(ownerId: number): Promise<ServiceRequest[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(serviceRequests)
    .where(eq(serviceRequests.ownerId, ownerId))
    .orderBy(desc(serviceRequests.createdAt));
}

export async function updateServiceRequest(id: number, data: Partial<InsertServiceRequest>): Promise<ServiceRequest | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(serviceRequests).set(data).where(eq(serviceRequests.id, id));
  return getServiceRequestById(id);
}

// ============================================================================
// SERVICE QUOTE OPERATIONS
// ============================================================================

export async function createServiceQuote(data: InsertServiceQuote): Promise<ServiceQuote> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(serviceQuotes).values(data);
  const quoteId = result[0].insertId;
  
  const [quote] = await db.select().from(serviceQuotes).where(eq(serviceQuotes.id, quoteId));
  return quote;
}

export async function getServiceQuotesByRequest(requestId: number): Promise<ServiceQuote[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(serviceQuotes)
    .where(eq(serviceQuotes.requestId, requestId))
    .orderBy(desc(serviceQuotes.recommendationScore));
}

export async function updateServiceQuote(id: number, data: Partial<InsertServiceQuote>): Promise<ServiceQuote | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(serviceQuotes).set(data).where(eq(serviceQuotes.id, id));
  
  const [quote] = await db.select().from(serviceQuotes).where(eq(serviceQuotes.id, id));
  return quote;
}

// ============================================================================
// SERVICE PROVIDER OPERATIONS
// ============================================================================

export async function createServiceProvider(data: InsertServiceProvider): Promise<ServiceProvider> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(serviceProviders).values(data);
  const providerId = result[0].insertId;
  
  const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, providerId));
  return provider;
}

export async function getAllServiceProviders(): Promise<ServiceProvider[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(serviceProviders)
    .where(eq(serviceProviders.isActive, 1))
    .orderBy(desc(serviceProviders.averageRating));
}

export async function getServiceProviderById(id: number): Promise<ServiceProvider | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [provider] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, id));
  return provider;
}

// ============================================================================
// FLEET RISK SCORE OPERATIONS
// ============================================================================

export async function createFleetRiskScore(data: InsertFleetRiskScore): Promise<FleetRiskScore> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(fleetRiskScores).values(data);
  const scoreId = result[0].insertId;
  
  const [score] = await db.select().from(fleetRiskScores).where(eq(fleetRiskScores.id, scoreId));
  return score;
}

export async function getFleetRiskScoreByVehicle(vehicleId: number): Promise<FleetRiskScore | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [score] = await db.select().from(fleetRiskScores).where(eq(fleetRiskScores.vehicleId, vehicleId));
  return score;
}

export async function updateFleetRiskScore(vehicleId: number, data: Partial<InsertFleetRiskScore>): Promise<FleetRiskScore | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.update(fleetRiskScores).set(data).where(eq(fleetRiskScores.vehicleId, vehicleId));
  return getFleetRiskScoreByVehicle(vehicleId);
}

// ============================================================================
// AUDIT LOG OPERATIONS
// ============================================================================

export async function createFleetAuditLog(data: InsertFleetAuditLog): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db.insert(fleetAuditLogs).values(data);
}

export async function getFleetAuditLogs(entityType: string, entityId: number): Promise<FleetAuditLog[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(fleetAuditLogs)
    .where(and(
      eq(fleetAuditLogs.entityType, entityType as any),
      eq(fleetAuditLogs.entityId, entityId)
    ))
    .orderBy(desc(fleetAuditLogs.timestamp));
}

// ============================================================================
// MILEAGE LOG OPERATIONS
// ============================================================================

export async function createMileageLog(data: any): Promise<any> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const result = await db.insert(vehicleMileageLogs).values(data);
  const logId = result[0].insertId;
  
  const [log] = await db.select().from(vehicleMileageLogs).where(eq(vehicleMileageLogs.id, logId));
  return log;
}

export async function getMileageLogsByVehicle(vehicleId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  return db.select().from(vehicleMileageLogs)
    .where(eq(vehicleMileageLogs.vehicleId, vehicleId))
    .orderBy(desc(vehicleMileageLogs.recordedDate));
}

export async function getLatestMileage(vehicleId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [log] = await db.select().from(vehicleMileageLogs)
    .where(eq(vehicleMileageLogs.vehicleId, vehicleId))
    .orderBy(desc(vehicleMileageLogs.recordedDate))
    .limit(1);
  
  return log?.mileage || null;
}
