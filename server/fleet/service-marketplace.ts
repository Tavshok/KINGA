import { getDb } from "../db";
import { serviceRequests, serviceQuotes, serviceProviders } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * Service Quote Marketplace
 * Connects fleet owners with service providers for maintenance and repairs
 */

export interface ServiceProvider {
  id: number;
  name: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  serviceTypes: string[];
  rating: number;
  completedJobs: number;
  averageResponseTime: number; // hours
  isVerified: boolean;
}

export interface ServiceQuote {
  id: number;
  serviceRequestId: number;
  providerId: number;
  providerName: string;
  quotedPrice: number; // in cents
  estimatedDuration: number; // days
  validUntil: Date;
  description: string;
  status: string;
  submittedAt: Date;
}

/**
 * Create a service request
 */
export async function createServiceRequest(data: {
  vehicleId: number;
  serviceType: string;
  priority: "low" | "medium" | "high" | "urgent";
  description: string;
  preferredDate?: Date | null;
  budget?: number | null; // in cents
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(serviceRequests).values({
    vehicleId: data.vehicleId,
    serviceType: data.serviceType,
    priority: data.priority,
    description: data.description,
    preferredDate: data.preferredDate || null,
    budget: data.budget || null,
    status: "open",
    tenantId: data.tenantId,
  });

  return result;
}

/**
 * Get service requests for a vehicle or fleet
 */
export async function getServiceRequests(vehicleId?: number, fleetId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let conditions = [];
  if (vehicleId) {
    conditions.push(eq(serviceRequests.vehicleId, vehicleId));
  }

  const requests = await db
    .select()
    .from(serviceRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(serviceRequests.createdAt));

  return requests;
}

/**
 * Submit a quote for a service request
 */
export async function submitServiceQuote(data: {
  serviceRequestId: number;
  providerId: number;
  quotedPrice: number; // in cents
  estimatedDuration: number; // days
  validUntil: Date;
  description: string;
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(serviceQuotes).values({
    serviceRequestId: data.serviceRequestId,
    providerId: data.providerId,
    quotedPrice: data.quotedPrice,
    estimatedDuration: data.estimatedDuration,
    validUntil: data.validUntil,
    description: data.description,
    status: "pending",
    tenantId: data.tenantId,
  });

  return result;
}

/**
 * Get quotes for a service request
 */
export async function getServiceQuotes(serviceRequestId: number): Promise<ServiceQuote[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const quotes = await db
    .select({
      quote: serviceQuotes,
      provider: serviceProviders,
    })
    .from(serviceQuotes)
    .innerJoin(serviceProviders, eq(serviceQuotes.providerId, serviceProviders.id))
    .where(eq(serviceQuotes.serviceRequestId, serviceRequestId))
    .orderBy(desc(serviceQuotes.createdAt));

  return quotes.map(({ quote, provider }) => ({
    id: quote.id,
    serviceRequestId: quote.serviceRequestId,
    providerId: quote.providerId,
    providerName: provider.name,
    quotedPrice: quote.quotedPrice,
    estimatedDuration: quote.estimatedDuration,
    validUntil: quote.validUntil,
    description: quote.description || "",
    status: quote.status,
    submittedAt: quote.createdAt,
  }));
}

/**
 * Accept a service quote
 */
export async function acceptServiceQuote(quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update quote status
  await db
    .update(serviceQuotes)
    .set({ status: "accepted" })
    .where(eq(serviceQuotes.id, quoteId));

  // Get the quote to update service request
  const quote = await db
    .select()
    .from(serviceQuotes)
    .where(eq(serviceQuotes.id, quoteId))
    .limit(1);

  if (quote.length > 0) {
    // Update service request status
    await db
      .update(serviceRequests)
      .set({ status: "in_progress" })
      .where(eq(serviceRequests.id, quote[0].serviceRequestId));

    // Reject other quotes for this request
    await db
      .update(serviceQuotes)
      .set({ status: "rejected" })
      .where(
        and(
          eq(serviceQuotes.serviceRequestId, quote[0].serviceRequestId),
          eq(serviceQuotes.status, "pending")
        )
      );
  }

  return { success: true };
}

/**
 * Register a service provider
 */
export async function registerServiceProvider(data: {
  name: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  serviceTypes: string;
  tenantId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(serviceProviders).values({
    providerName: data.name,
    providerType: "mechanic",
    email: data.contactEmail,
    phone: data.contactPhone,
    address: data.address,
    specializations: data.serviceTypes,
    averageRating: "0",
    totalJobsCompleted: 0,
    averageCompletionTime: "24",
    isVerified: 0,
  });

  return result;
}

/**
 * Get all service providers
 */
export async function getServiceProviders(): Promise<ServiceProvider[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const providers = await db.select().from(serviceProviders);

  return providers.map((p) => ({
    id: p.id,
    name: p.providerName,
    contactEmail: p.email || "",
    contactPhone: p.phone || "",
    address: p.address || "",
    serviceTypes: p.specializations ? JSON.parse(p.specializations) : [],
    rating: p.averageRating ? parseFloat(p.averageRating) : 0,
    completedJobs: p.totalJobsCompleted || 0,
    averageResponseTime: p.averageCompletionTime ? parseFloat(p.averageCompletionTime) : 24,
    isVerified: p.isVerified === 1,
  }));
}

/**
 * Get service provider by ID
 */
export async function getServiceProviderById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const provider = await db
    .select()
    .from(serviceProviders)
    .where(eq(serviceProviders.id, id))
    .limit(1);

  return provider[0] || null;
}

/**
 * Update service provider rating after job completion
 */
export async function updateProviderRating(providerId: number, rating: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const provider = await getServiceProviderById(providerId);
  if (!provider) throw new Error("Provider not found");

  const currentRating = provider.averageRating ? parseFloat(provider.averageRating) : 0;
  const currentJobs = provider.totalJobsCompleted || 0;
  const totalRating = currentRating * currentJobs + rating;
  const newCompletedJobs = currentJobs + 1;
  const newRating = totalRating / newCompletedJobs;

  await db
    .update(serviceProviders)
    .set({
      averageRating: newRating.toFixed(2),
      totalJobsCompleted: newCompletedJobs,
    })
    .where(eq(serviceProviders.id, providerId));

  return { success: true };
}

/**
 * Complete a service request
 */
export async function completeServiceRequest(serviceRequestId: number, rating: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update service request status
  await db
    .update(serviceRequests)
    .set({ status: "completed" })
    .where(eq(serviceRequests.id, serviceRequestId));

  // Find accepted quote and update provider rating
  const acceptedQuote = await db
    .select()
    .from(serviceQuotes)
    .where(
      and(
        eq(serviceQuotes.serviceRequestId, serviceRequestId),
        eq(serviceQuotes.status, "accepted")
      )
    )
    .limit(1);

  if (acceptedQuote.length > 0) {
    await updateProviderRating(acceptedQuote[0].providerId, rating);
  }

  return { success: true };
}
