/**
 * Insurance Router
 * Extracted from server/routers.ts (TECH-02: router file split, Aug 2026)
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  getQuoteById
} from "../db";
import { eq, and, desc, asc, inArray, gte, lte, or, sql, count, avg } from "drizzle-orm";
import {
  insuranceQuotes, insuranceProducts, insuranceCarriers, insurancePolicies,
  claims, auditTrail, notifications, fleetVehicles,
} from "../../drizzle/schema";
import { nanoid } from "nanoid";
import { storagePut } from "../storage";
import { isAdminRole } from "../../shared/role-permissions";
export const insuranceCoreRouter = router({
  // Get vehicle valuation estimate
  getVehicleValuation: publicProcedure
    .input(z.object({
      make: z.string(),
      model: z.string(),
      year: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { generateVehicleValuation } = await import('../insurance/valuation-engine');
      return generateVehicleValuation(input);
    }),

  // Request insurance quote. Client identity must come from the signed-in session;
  // a quote must never be assigned to a shared placeholder customer.
  requestQuote: protectedProcedure
    .input(z.object({
      registrationNumber: z.string(),
      make: z.string(),
      model: z.string(),
      year: z.number(),
      currentValue: z.number(),
      driverAge: z.number(),
      annualMileage: z.enum(['low', 'medium', 'high']),
      phoneNumber: z.string(),
      email: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createQuote, createVehicle, getVehicleByRegistration, getAllActiveCarriers, getProductsByCarrier } = await import('../insurance/insurance-db');
      const { calculateVehicleRiskScore } = await import('../insurance/valuation-engine');
      
      const customerId = ctx.user.id;
      const tenantId = ctx.user.tenantId ?? null;
      
      // Step 1: Check if vehicle exists, if not create it
      let vehicle = await getVehicleByRegistration(input.registrationNumber);
      
      if (!vehicle) {
        // Calculate risk score for new vehicle
        const riskScore = await calculateVehicleRiskScore(input.make, input.model, input.year);
        
        vehicle = await createVehicle({
          registrationNumber: input.registrationNumber,
          make: input.make,
          model: input.model,
          year: input.year,
          currentValuation: input.currentValue,
          riskScore,
          ownerId: customerId, // Use the same customer ID
          tenantId,
        });
      }
      
      // Step 2: Get default carrier and product (for now, use first active carrier)
      const carriers = await getAllActiveCarriers();
      if (carriers.length === 0) {
        throw new Error('No active insurance carriers available');
      }
      const carrier = carriers[0];
      
      const products = await getProductsByCarrier(carrier.id);
      if (products.length === 0) {
        throw new Error('No insurance products available');
      }
      const product = products[0];
      
      // Step 3: Calculate premium based on risk factors
      const basePremium = input.currentValue * 0.05; // 5% of vehicle value
      const ageFactor = input.driverAge < 25 ? 1.5 : input.driverAge > 60 ? 1.2 : 1.0;
      const mileageFactor = input.annualMileage === 'high' ? 1.3 : input.annualMileage === 'low' ? 0.9 : 1.0;
      
      const annualPremium = Math.round(basePremium * ageFactor * mileageFactor);
      const monthlyPremium = Math.round(annualPremium / 12);
      
      // Step 4: Create quote
      const quoteNumber = `QT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const quoteValidUntil = new Date();
      quoteValidUntil.setDate(quoteValidUntil.getDate() + 30); // Valid for 30 days
      
      const quote = await createQuote({
        quoteNumber,
        customerId,
        vehicleId: vehicle.id,
        carrierId: carrier.id,
        productId: product.id,
        premiumAmount: monthlyPremium,
        premiumFrequency: 'monthly',
        excessAmount: 50000, // Default $500 excess
        driverDetails: JSON.stringify({
          age: input.driverAge,
          annualMileage: input.annualMileage,
          phoneNumber: input.phoneNumber,
          email: input.email,
        }),
        riskProfile: JSON.stringify({
          vehicleRisk: vehicle.riskScore,
          driverAgeRisk: input.driverAge < 25 ? 'high' : input.driverAge > 60 ? 'medium' : 'low',
          mileageRisk: input.annualMileage,
        }),
        quoteValidUntil: quoteValidUntil.toISOString(),
        status: 'pending',
        tenantId,
      });
      
      return {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        premiumAmount: monthlyPremium,
        annualPremium,
        validUntil: quoteValidUntil,
      };
    }),

  // Get quote details. Clients can see only their own records; administrators
  // retain oversight access for support and controlled testing.
  getQuote: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const { getQuoteById } = await import('../insurance/insurance-db');
      const quote = await getQuoteById(input.quoteId);
      if (!quote) return null;
      const isAdmin = isAdminRole(ctx.user.role);
      if (!isAdmin && quote.customerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this quotation." });
      }
      return quote;
    }),

  // Submit payment proof
  submitPaymentProof: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      paymentMethod: z.enum(['cash', 'bank_transfer', 'ecocash', 'onemoney', 'rtgs', 'zipit']),
      referenceNumber: z.string().optional(),
      paymentDate: z.date(),
      paymentProofBase64: z.string(),
      paymentProofFileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { storagePut } = await import('../storage');
      const { getQuoteById } = await import('../insurance/insurance-db');
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      // Get quote to verify it exists and get premium amount
      const quote = await getQuoteById(input.quoteId);
      if (!quote) {
        throw new Error('Quote not found');
      }
      if (!isAdminRole(ctx.user.role) && quote.customerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this quotation.' });
      }
      
      // Upload payment proof to S3
      const base64Data = input.paymentProofBase64.split(',')[1] || input.paymentProofBase64;
      const buffer = Buffer.from(base64Data, 'base64');
      const fileExtension = input.paymentProofFileName.split('.').pop() || 'jpg';
      const s3Key = `insurance/payment-proofs/${input.quoteId}-${Date.now()}.${fileExtension}`;
      
      const { url: s3Url } = await storagePut(s3Key, buffer, `image/${fileExtension}`);
      
      // Update quote with payment information
      await db.update(insuranceQuotes)
        .set({
          status: 'payment_submitted',
          paymentMethod: input.paymentMethod,
          paymentReferenceNumber: input.referenceNumber || null,
          paymentDate: input.paymentDate instanceof Date ? input.paymentDate.toISOString() : input.paymentDate,
          paymentSubmittedAt: new Date().toISOString(),
          paymentProofS3Key: s3Key,
          paymentProofS3Url: s3Url,
          paymentAmount: quote.premiumAmount, // Store the premium amount for verification
        })
        .where(eq(insuranceQuotes.id, input.quoteId));
      
      return { success: true, message: 'Payment proof submitted successfully' };
    }),

  // Get pending payments for verification
  getPendingPayments: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      // Insurer users can process only their own tenant's payments; platform
      // administrators retain cross-tenant oversight for support and testing.
      if (ctx.user.role !== 'insurer' && !isAdminRole(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can verify payments' });
      }
      const paymentScope = isAdminRole(ctx.user.role)
        ? eq(insuranceQuotes.status, 'payment_submitted')
        : and(
            eq(insuranceQuotes.status, 'payment_submitted'),
            eq(insuranceQuotes.tenantId, ctx.user.tenantId ?? '__unassigned__'),
          );
      const pendingQuotes = await db.select()
        .from(insuranceQuotes)
        .where(paymentScope)
        .limit(500); // M-01: cap pending quotes list
      
      return pendingQuotes;
    }),

  // Verify payment
  verifyPayment: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      if (ctx.user.role !== 'insurer' && !isAdminRole(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can verify payments' });
      }
      const quote = (await db.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, input.quoteId)))[0];
      if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
      if (!isAdminRole(ctx.user.role) && quote.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This quote belongs to another insurer tenant.' });
      }
      
      // Update quote status to payment_verified
      await db.update(insuranceQuotes)
        .set({
          status: 'payment_verified',
          paymentVerifiedAt: new Date().toISOString(),
          paymentVerifiedBy: ctx.user.id,
        })
        .where(eq(insuranceQuotes.id, input.quoteId));
      
      // Trigger policy issuance workflow
      const { issuePolicyFromQuote } = await import('../insurance/policy-issuance');
      const policy = await issuePolicyFromQuote(input.quoteId);
      
      return { 
        success: true, 
        message: 'Payment verified and policy issued successfully',
        policyNumber: policy.policyNumber,
        policyId: policy.id,
      };
    }),

  // Reject payment
  rejectPayment: protectedProcedure
    .input(z.object({
      quoteId: z.number(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      if (ctx.user.role !== 'insurer' && !isAdminRole(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only insurers can reject payments' });
      }
      const quote = (await db.select().from(insuranceQuotes).where(eq(insuranceQuotes.id, input.quoteId)))[0];
      if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Quote not found' });
      if (!isAdminRole(ctx.user.role) && quote.tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This quote belongs to another insurer tenant.' });
      }
      
      // Update quote status to rejected with reason
      await db.update(insuranceQuotes)
        .set({
          status: 'rejected',
          paymentRejectionReason: input.reason,
        })
        .where(eq(insuranceQuotes.id, input.quoteId));
      
      // TODO: Notify customer of rejection
      
      return { success: true, message: 'Payment rejected' };
    }),

  // Get customer's policies
  getMyPolicies: protectedProcedure
    .query(async ({ ctx }) => {
      const { getPoliciesByCustomer } = await import('../insurance/policy-issuance');
      return await getPoliciesByCustomer(ctx.user.id);
    }),

  // Get customer's quotes
  getMyQuotes: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');

      const quotes = await db.select()
        .from(insuranceQuotes)
        .where(eq(insuranceQuotes.customerId, ctx.user.id))
        .limit(100); // M-01: cap per-user quote history

      const vehicleIds = [...new Set(quotes.map((quote) => quote.vehicleId))];
      const vehicles = vehicleIds.length
        ? await db.select().from(fleetVehicles).where(inArray(fleetVehicles.id, vehicleIds))
        : [];
      const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

      return quotes.map((quote) => {
        const vehicle = vehicleById.get(quote.vehicleId);
        return {
          ...quote,
          vehicleRegistration: vehicle?.registrationNumber ?? `Vehicle #${quote.vehicleId}`,
          vehicleMake: vehicle?.make ?? null,
          vehicleModel: vehicle?.model ?? null,
          insuranceType: "motor",
          quotedPremium: quote.premiumAmount,
        };
      });
    }),

  // Download policy PDF
  downloadPolicyPDF: protectedProcedure
    .input(z.object({
      policyId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database connection failed');
      
      // Get policy details
      const policies = await db.select()
        .from(insurancePolicies)
        .where(eq(insurancePolicies.id, input.policyId));
      
      if (!policies || policies.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Policy not found' });
      }
      
      const policy = policies[0];
      
      // Verify ownership
      if (!isAdminRole(ctx.user.role) && policy.customerId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You do not have access to this policy' });
      }
      
      // Get vehicle details
      const vehicles = await db.select()
        .from(fleetVehicles)
        .where(eq(fleetVehicles.id, policy.vehicleId));
      
      if (!vehicles || vehicles.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Vehicle not found' });
      }
      
      const vehicle = vehicles[0];
      
      // Get carrier details
      const carriers = await db.select()
        .from(insuranceCarriers)
        .where(eq(insuranceCarriers.id, policy.carrierId));
      
      const carrier = carriers && carriers.length > 0 ? carriers[0] : null;
      
      // Get product details
      const products = await db.select()
        .from(insuranceProducts)
        .where(eq(insuranceProducts.id, policy.productId));
      
      const product = products && products.length > 0 ? products[0] : null;
      
      // Generate PDF
      const { generatePolicyPDF } = await import('../insurance/policy-pdf-generator');
      const pdfBuffer = await generatePolicyPDF({
        policyNumber: policy.policyNumber,
        customerName: ctx.user.name || 'N/A',
        customerEmail: ctx.user.email || undefined,
        customerPhone: 'N/A',
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleYear: vehicle.year,
        vehicleRegistration: vehicle.registrationNumber,
        vehicleValue: 0, // Vehicle value not stored in fleetVehicles
        productName: product?.productName || 'Comprehensive Motor Insurance',
        carrierName: carrier?.name || 'Zimbabwe Insurance Corporation',
        premiumAmount: policy.premiumAmount,
        premiumFrequency: policy.premiumFrequency,
        excessAmount: policy.excessAmount || undefined,
        coverageStartDate: new Date(policy.coverageStartDate),
        coverageEndDate: new Date(policy.coverageEndDate),
        coverageLimits: policy.coverageLimits || undefined,
      });
      
      // Convert buffer to base64 for transmission
      const base64PDF = pdfBuffer.toString('base64');
      
      return {
        success: true,
        filename: `policy-${policy.policyNumber}.pdf`,
        data: base64PDF,
      };
    }),
});
