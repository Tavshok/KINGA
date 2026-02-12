import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  insuranceCarriers,
  insuranceProducts,
  fleetVehicles,
  insuranceQuotes,
  insurancePolicies,
  policyEndorsements,
  policyDocuments,
  commissionRecords,
  customerDocuments,
  insuranceAuditLogs,
  customerConsent,
  policyClaimLinks,
} from "../../drizzle/schema";
import type {
  InsuranceCarrier,
  InsuranceProduct,
  FleetVehicle,
  InsuranceQuote,
  InsurancePolicy,
  PolicyEndorsement,
  PolicyDocument,
  CommissionRecord,
  CustomerDocument,
  InsuranceAuditLog,
  CustomerConsent,
  PolicyClaimLink,
} from "../../drizzle/schema";

// ============================================================================
// INSURANCE CARRIERS
// ============================================================================

export async function getAllActiveCarriers(): Promise<InsuranceCarrier[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(insuranceCarriers).where(eq(insuranceCarriers.isActive, 1));
}

export async function getCarrierById(carrierId: number): Promise<InsuranceCarrier | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(insuranceCarriers).where(eq(insuranceCarriers.id, carrierId));
  return result[0];
}

export async function createCarrier(carrier: typeof insuranceCarriers.$inferInsert): Promise<InsuranceCarrier> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(insuranceCarriers).values(carrier);
  const inserted = await getCarrierById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create carrier");
  return inserted;
}

// ============================================================================
// INSURANCE PRODUCTS
// ============================================================================

export async function getProductsByCarrier(carrierId: number): Promise<InsuranceProduct[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insuranceProducts)
    .where(and(eq(insuranceProducts.carrierId, carrierId), eq(insuranceProducts.isActive, 1)));
}

export async function getProductById(productId: number): Promise<InsuranceProduct | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(insuranceProducts).where(eq(insuranceProducts.id, productId));
  return result[0];
}

export async function createProduct(product: typeof insuranceProducts.$inferInsert): Promise<InsuranceProduct> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(insuranceProducts).values(product);
  const inserted = await getProductById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create product");
  return inserted;
}

// ============================================================================
// FLEET VEHICLES
// ============================================================================

export async function getVehicleByRegistration(registrationNumber: string): Promise<FleetVehicle | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db
    .select()
    .from(fleetVehicles)
    .where(eq(fleetVehicles.registrationNumber, registrationNumber));
  return result[0];
}

export async function getVehicleById(vehicleId: number): Promise<FleetVehicle | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(fleetVehicles).where(eq(fleetVehicles.id, vehicleId));
  return result[0];
}

export async function getVehiclesByOwner(ownerId: number): Promise<FleetVehicle[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(fleetVehicles).where(eq(fleetVehicles.ownerId, ownerId));
}

export async function createVehicle(vehicle: typeof fleetVehicles.$inferInsert): Promise<FleetVehicle> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(fleetVehicles).values(vehicle);
  const inserted = await getVehicleById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create vehicle");
  return inserted;
}

export async function updateVehicleValuation(
  vehicleId: number,
  valuation: number,
  source: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(fleetVehicles)
    .set({
      currentValuation: valuation,
      valuationDate: new Date(),
      valuationSource: source,
    })
    .where(eq(fleetVehicles.id, vehicleId));
}

export async function updateVehicleRiskScore(vehicleId: number, riskScore: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(fleetVehicles).set({ riskScore }).where(eq(fleetVehicles.id, vehicleId));
}

// ============================================================================
// INSURANCE QUOTES
// ============================================================================

export async function createQuote(quote: typeof insuranceQuotes.$inferInsert): Promise<InsuranceQuote> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(insuranceQuotes).values(quote);
  const inserted = await getQuoteById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create quote");
  return inserted;
}

export async function getQuoteById(quoteId: number): Promise<InsuranceQuote | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, quoteId));
  return result[0];
}

export async function getQuotesByCustomer(customerId: number): Promise<InsuranceQuote[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insuranceQuotes)
    .where(eq(insuranceQuotes.customerId, customerId))
    .orderBy(desc(insuranceQuotes.createdAt));
}

export async function getQuotesByVehicle(vehicleId: number): Promise<InsuranceQuote[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insuranceQuotes)
    .where(eq(insuranceQuotes.vehicleId, vehicleId))
    .orderBy(desc(insuranceQuotes.createdAt));
}

export async function updateQuoteStatus(
  quoteId: number,
  status: "pending" | "accepted" | "rejected" | "expired"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(insuranceQuotes).set({ status }).where(eq(insuranceQuotes.id, quoteId));
}

// ============================================================================
// INSURANCE POLICIES
// ============================================================================

export async function createPolicy(policy: typeof insurancePolicies.$inferInsert): Promise<InsurancePolicy> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(insurancePolicies).values(policy);
  const inserted = await getPolicyById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create policy");
  return inserted;
}

export async function getPolicyById(policyId: number): Promise<InsurancePolicy | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(insurancePolicies).where(eq(insurancePolicies.id, policyId));
  return result[0];
}

export async function getPolicyByNumber(policyNumber: string): Promise<InsurancePolicy | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.policyNumber, policyNumber));
  return result[0];
}

export async function getPoliciesByCustomer(customerId: number): Promise<InsurancePolicy[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.customerId, customerId))
    .orderBy(desc(insurancePolicies.createdAt));
}

export async function getActivePoliciesByCustomer(customerId: number): Promise<InsurancePolicy[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insurancePolicies)
    .where(and(eq(insurancePolicies.customerId, customerId), eq(insurancePolicies.status, "active")))
    .orderBy(desc(insurancePolicies.createdAt));
}

export async function getPoliciesByVehicle(vehicleId: number): Promise<InsurancePolicy[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.vehicleId, vehicleId))
    .orderBy(desc(insurancePolicies.createdAt));
}

export async function updatePolicyStatus(
  policyId: number,
  status: "pending" | "active" | "endorsed" | "cancelled" | "expired" | "renewed"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.update(insurancePolicies).set({ status }).where(eq(insurancePolicies.id, policyId));
}

export async function cancelPolicy(
  policyId: number,
  reason: string,
  cancelledBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(insurancePolicies)
    .set({
      status: "cancelled",
      cancellationReason: reason,
      cancellationDate: new Date(),
      cancelledBy,
    })
    .where(eq(insurancePolicies.id, policyId));
}

// ============================================================================
// POLICY ENDORSEMENTS
// ============================================================================

export async function createEndorsement(
  endorsement: typeof policyEndorsements.$inferInsert
): Promise<PolicyEndorsement> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(policyEndorsements).values(endorsement);
  const inserted = await getEndorsementById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create endorsement");
  return inserted;
}

export async function getEndorsementById(endorsementId: number): Promise<PolicyEndorsement | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(policyEndorsements).where(eq(policyEndorsements.id, endorsementId));
  return result[0];
}

export async function getEndorsementsByPolicy(policyId: number): Promise<PolicyEndorsement[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(policyEndorsements)
    .where(eq(policyEndorsements.policyId, policyId))
    .orderBy(desc(policyEndorsements.createdAt));
}

export async function approveEndorsement(endorsementId: number, approvedBy: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(policyEndorsements)
    .set({
      status: "approved",
      approvedBy,
      approvedAt: new Date(),
    })
    .where(eq(policyEndorsements.id, endorsementId));
}

// ============================================================================
// POLICY DOCUMENTS
// ============================================================================

export async function createPolicyDocument(
  document: typeof policyDocuments.$inferInsert
): Promise<PolicyDocument> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(policyDocuments).values(document);
  const inserted = await getPolicyDocumentById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create policy document");
  return inserted;
}

export async function getPolicyDocumentById(documentId: number): Promise<PolicyDocument | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(policyDocuments).where(eq(policyDocuments.id, documentId));
  return result[0];
}

export async function getDocumentsByPolicy(policyId: number): Promise<PolicyDocument[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(policyDocuments)
    .where(eq(policyDocuments.policyId, policyId))
    .orderBy(desc(policyDocuments.createdAt));
}

// ============================================================================
// COMMISSION RECORDS
// ============================================================================

export async function createCommissionRecord(
  commission: typeof commissionRecords.$inferInsert
): Promise<CommissionRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(commissionRecords).values(commission);
  const inserted = await getCommissionRecordById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create commission record");
  return inserted;
}

export async function getCommissionRecordById(commissionId: number): Promise<CommissionRecord | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(commissionRecords).where(eq(commissionRecords.id, commissionId));
  return result[0];
}

export async function getCommissionsByPolicy(policyId: number): Promise<CommissionRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(commissionRecords).where(eq(commissionRecords.policyId, policyId));
}

export async function getCommissionsByPeriod(period: string): Promise<CommissionRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(commissionRecords).where(eq(commissionRecords.commissionPeriod, period));
}

export async function getCommissionsByCarrier(carrierId: number): Promise<CommissionRecord[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(commissionRecords)
    .where(eq(commissionRecords.carrierId, carrierId))
    .orderBy(desc(commissionRecords.createdAt));
}

export async function updateCommissionPaymentStatus(
  commissionId: number,
  status: "pending" | "paid" | "disputed",
  paymentDate?: Date,
  paymentReference?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(commissionRecords)
    .set({
      paymentStatus: status,
      paymentDate,
      paymentReference,
    })
    .where(eq(commissionRecords.id, commissionId));
}

// ============================================================================
// CUSTOMER DOCUMENTS
// ============================================================================

export async function createCustomerDocument(
  document: typeof customerDocuments.$inferInsert
): Promise<CustomerDocument> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(customerDocuments).values(document);
  const inserted = await getCustomerDocumentById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to create customer document");
  return inserted;
}

export async function getCustomerDocumentById(documentId: number): Promise<CustomerDocument | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(customerDocuments).where(eq(customerDocuments.id, documentId));
  return result[0];
}

export async function getDocumentsByCustomer(customerId: number): Promise<CustomerDocument[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(customerDocuments)
    .where(eq(customerDocuments.customerId, customerId))
    .orderBy(desc(customerDocuments.uploadedAt));
}

export async function verifyCustomerDocument(
  documentId: number,
  verifiedBy: number,
  approved: boolean,
  rejectionReason?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(customerDocuments)
    .set({
      verificationStatus: approved ? "verified" : "rejected",
      verifiedAt: new Date(),
      verifiedBy,
      rejectionReason: rejectionReason || null,
    })
    .where(eq(customerDocuments.id, documentId));
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export async function createAuditLog(log: typeof insuranceAuditLogs.$inferInsert): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(insuranceAuditLogs).values(log);
}

export async function getAuditLogsByEntity(
  entityType: string,
  entityId: number
): Promise<InsuranceAuditLog[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(insuranceAuditLogs)
    .where(and(eq(insuranceAuditLogs.entityType, entityType), eq(insuranceAuditLogs.entityId, entityId)))
    .orderBy(desc(insuranceAuditLogs.timestamp));
}

// ============================================================================
// CUSTOMER CONSENT
// ============================================================================

export async function recordConsent(consent: typeof customerConsent.$inferInsert): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db.insert(customerConsent).values(consent);
}

export async function getConsentByCustomer(customerId: number): Promise<CustomerConsent[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(customerConsent).where(eq(customerConsent.customerId, customerId));
}

export async function withdrawConsent(
  customerId: number,
  consentType: "data_processing" | "marketing" | "third_party_sharing" | "credit_check" | "automated_decision_making"
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(customerConsent)
    .set({ withdrawnDate: new Date() })
    .where(and(eq(customerConsent.customerId, customerId), eq(customerConsent.consentType, consentType)));
}

// ============================================================================
// POLICY-CLAIM LINKS
// ============================================================================

export async function linkClaimToPolicy(
  policyId: number,
  claimId: number,
  tenantId?: string
): Promise<PolicyClaimLink> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.insert(policyClaimLinks).values({
    policyId,
    claimId,
    tenantId: tenantId || null,
  });
  const inserted = await getPolicyClaimLinkById(Number(result[0].insertId));
  if (!inserted) throw new Error("Failed to link claim to policy");
  return inserted;
}

export async function getPolicyClaimLinkById(linkId: number): Promise<PolicyClaimLink | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(policyClaimLinks).where(eq(policyClaimLinks.id, linkId));
  return result[0];
}

export async function getClaimsByPolicy(policyId: number): Promise<PolicyClaimLink[]> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db.select().from(policyClaimLinks).where(eq(policyClaimLinks.policyId, policyId));
}

export async function getPolicyByClaimId(claimId: number): Promise<PolicyClaimLink | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  const result = await db.select().from(policyClaimLinks).where(eq(policyClaimLinks.claimId, claimId));
  return result[0];
}

export async function verifyCoverage(
  linkId: number,
  verifiedBy: number,
  approved: boolean,
  reason?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  await db
    .update(policyClaimLinks)
    .set({
      coverageVerified: 1,
      verifiedBy,
      verifiedAt: new Date(),
      coverageApproved: approved ? 1 : 0,
      coverageDecisionReason: reason || null,
    })
    .where(eq(policyClaimLinks.id, linkId));
}
