/**
 * Policy Issuance Module
 * 
 * Handles the automatic conversion of verified quotes into active insurance policies.
 * Generates policy numbers, creates policy records, and manages policy lifecycle.
 */

import { getDb } from '../db';
import { insurancePolicies, insuranceQuotes } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate a unique policy number
 * Format: POL-YYYYMMDD-XXXXXX (e.g., POL-20260213-000001)
 */
export async function generatePolicyNumber(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Get count of policies created today to generate sequence number
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  
  const todayPolicies = await db.select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.createdAt, todayStart));
  
  const sequence = (todayPolicies.length + 1).toString().padStart(6, '0');
  
  return `POL-${dateStr}-${sequence}`;
}

/**
 * Issue a policy from a verified quote
 * 
 * @param quoteId - The ID of the verified quote
 * @returns The created policy record
 */
export async function issuePolicyFromQuote(quoteId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  // Get the quote
  const quote = await db.select()
    .from(insuranceQuotes)
    .where(eq(insuranceQuotes.id, quoteId))
    .limit(1);
  
  if (!quote || quote.length === 0) {
    throw new Error('Quote not found');
  }
  
  const quoteData = quote[0];
  
  // Verify quote status
  if (quoteData.status !== 'payment_verified') {
    throw new Error('Quote payment must be verified before policy issuance');
  }
  
  // Generate policy number
  const policyNumber = await generatePolicyNumber();
  
  // Calculate policy dates
  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1); // 1 year policy
  
  // Create policy record
  const result = await db.insert(insurancePolicies).values({
    policyNumber,
    quoteId: quoteData.id,
    customerId: quoteData.customerId,
    vehicleId: quoteData.vehicleId,
    carrierId: quoteData.carrierId,
    productId: quoteData.productId,
    premiumAmount: quoteData.premiumAmount,
    premiumFrequency: quoteData.premiumFrequency,
    excessAmount: quoteData.excessAmount,
    coverageLimits: quoteData.coverageLimits,
    coverageStartDate: startDate,
    coverageEndDate: endDate,
    status: 'active',
    tenantId: quoteData.tenantId,
  });
  
  // Fetch the created policy
  const policy = await getPolicyByNumber(policyNumber);
  
  // Update quote status to accepted
  await db.update(insuranceQuotes)
    .set({ status: 'accepted' })
    .where(eq(insuranceQuotes.id, quoteId));
  
  return policy;
}

/**
 * Get policy by ID
 */
export async function getPolicyById(policyId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  const policies = await db.select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.id, policyId))
    .limit(1);
  
  return policies[0] || null;
}

/**
 * Get policy by policy number
 */
export async function getPolicyByNumber(policyNumber: string) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  const policies = await db.select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.policyNumber, policyNumber))
    .limit(1);
  
  return policies[0] || null;
}

/**
 * Get all policies for a customer
 */
export async function getPoliciesByCustomer(customerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  return await db.select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.customerId, customerId));
}

/**
 * Get active policies for a customer
 */
export async function getActivePoliciesByCustomer(customerId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  
  return await db.select()
    .from(insurancePolicies)
    .where(eq(insurancePolicies.customerId, customerId));
}
