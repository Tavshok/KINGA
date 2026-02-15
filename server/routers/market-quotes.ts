/**
 * Market Quotes Router
 * 
 * Admin-only procedures for ingesting supplier quotes and managing parts pricing baseline.
 * Supports PDF/Excel/image quote uploads with AI extraction.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { 
  supplierQuotes, 
  supplierQuoteLineItems,
  supplierPerformanceMetrics,
  partsPricingBaseline,
} from "../../drizzle/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { extractMarketQuote } from "../pricing/market-quote-extractor";
import { storagePut } from "../storage";

export const marketQuotesRouter = router({
  /**
   * Upload supplier quote document (PDF/Excel/image)
   * Admin uploads quote, system extracts data automatically
   */
  uploadQuote: adminProcedure
    .input(z.object({
      documentBase64: z.string(), // Base64 encoded document
      documentType: z.enum(["pdf", "excel", "image"]),
      fileName: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Upload document to S3
      const buffer = Buffer.from(input.documentBase64, 'base64');
      const fileKey = `market-quotes/${Date.now()}-${input.fileName}`;
      const { url: documentUrl } = await storagePut(fileKey, buffer, 
        input.documentType === 'pdf' ? 'application/pdf' : 
        input.documentType === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
        'image/jpeg'
      );
      
      // Extract data from document using AI
      const extractedData = await extractMarketQuote(documentUrl, input.documentType);
      
      // Create supplier quote record
      const [quote] = await db.insert(supplierQuotes).values({
        supplierName: extractedData.supplierName,
        supplierCountry: extractedData.supplierCountry,
        supplierContact: extractedData.supplierContact || null,
        quoteDate: new Date(extractedData.quoteDate),
        quoteNumber: extractedData.quoteNumber || null,
        quoteValidUntil: extractedData.quoteValidUntil ? new Date(extractedData.quoteValidUntil) : null,
        documentUrl,
        documentType: input.documentType,
        status: "pending",
        extractedAt: new Date(),
        extractionConfidence: extractedData.extractionConfidence.toString(),
        extractionNotes: JSON.stringify(extractedData.extractionNotes),
        uploadedBy: ctx.user.id,
        notes: input.notes || null,
      }).$returningId();
      
      // Insert line items
      const lineItemsToInsert = extractedData.lineItems.map(item => ({
        quoteId: quote.id,
        partName: item.partName,
        partNumber: item.partNumber || null,
        partDescription: item.partDescription || null,
        partCategory: item.partCategory || null,
        vehicleMake: item.vehicleMake || null,
        vehicleModel: item.vehicleModel || null,
        vehicleYearFrom: item.vehicleYearFrom || null,
        vehicleYearTo: item.vehicleYearTo || null,
        price: item.price.toString(),
        currency: item.currency,
        shippingCost: item.shippingCost?.toString() || null,
        customsDuty: item.customsDuty?.toString() || null,
        clearingFees: item.clearingFees?.toString() || null,
        forexCharges: item.forexCharges?.toString() || null,
        leadTimeDays: item.leadTimeDays || null,
        partType: item.partType,
        quantity: item.quantity,
        lineNumber: item.lineNumber,
        approved: false,
      }));
      
      if (lineItemsToInsert.length > 0) {
        await db.insert(supplierQuoteLineItems).values(lineItemsToInsert);
      }
      
      return {
        success: true,
        quoteId: quote.id,
        extractedData,
      };
    }),
  
  /**
   * Get list of pending supplier quotes for review
   */
  getPendingQuotes: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const quotes = await db
        .select()
        .from(supplierQuotes)
        .where(eq(supplierQuotes.status, "pending"))
        .orderBy(desc(supplierQuotes.uploadedAt));
      
      return quotes;
    }),
  
  /**
   * Get quote details with line items
   */
  getQuoteDetails: adminProcedure
    .input(z.object({
      quoteId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const [quote] = await db
        .select()
        .from(supplierQuotes)
        .where(eq(supplierQuotes.id, input.quoteId));
      
      if (!quote) {
        throw new Error("Quote not found");
      }
      
      const lineItems = await db
        .select()
        .from(supplierQuoteLineItems)
        .where(eq(supplierQuoteLineItems.quoteId, input.quoteId))
        .orderBy(supplierQuoteLineItems.lineNumber);
      
      return {
        quote,
        lineItems,
      };
    }),
  
  /**
   * Update line item data (admin can edit extracted data before approving)
   */
  updateLineItem: adminProcedure
    .input(z.object({
      lineItemId: z.number(),
      updates: z.object({
        partName: z.string().optional(),
        partNumber: z.string().nullable().optional(),
        partDescription: z.string().optional(),
        partCategory: z.string().nullable().optional(),
        vehicleMake: z.string().nullable().optional(),
        vehicleModel: z.string().nullable().optional(),
        vehicleYearFrom: z.number().optional(),
        vehicleYearTo: z.number().optional(),
        price: z.number().optional(),
        currency: z.string().optional(),
        shippingCost: z.number().optional(),
        customsDuty: z.number().optional(),
        clearingFees: z.number().optional(),
        forexCharges: z.number().optional(),
        leadTimeDays: z.number().optional(),
        partType: z.enum(["OEM", "OEM_Equivalent", "Aftermarket", "Used", "Unknown"]).optional(),
        quantity: z.number().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const { lineItemId, updates } = input;
      
      // Convert numeric fields to strings for decimal columns
      const updateData: any = {};
      if (updates.partName !== undefined) updateData.partName = updates.partName;
      if (updates.partNumber !== undefined) updateData.partNumber = updates.partNumber;
      if (updates.partDescription !== undefined) updateData.partDescription = updates.partDescription;
      if (updates.partCategory !== undefined) updateData.partCategory = updates.partCategory;
      if (updates.vehicleMake !== undefined) updateData.vehicleMake = updates.vehicleMake;
      if (updates.vehicleModel !== undefined) updateData.vehicleModel = updates.vehicleModel;
      if (updates.vehicleYearFrom !== undefined) updateData.vehicleYearFrom = updates.vehicleYearFrom;
      if (updates.vehicleYearTo !== undefined) updateData.vehicleYearTo = updates.vehicleYearTo;
      if (updates.price !== undefined) updateData.price = updates.price.toString();
      if (updates.currency !== undefined) updateData.currency = updates.currency;
      if (updates.shippingCost !== undefined) updateData.shippingCost = updates.shippingCost?.toString();
      if (updates.customsDuty !== undefined) updateData.customsDuty = updates.customsDuty?.toString();
      if (updates.clearingFees !== undefined) updateData.clearingFees = updates.clearingFees?.toString();
      if (updates.forexCharges !== undefined) updateData.forexCharges = updates.forexCharges?.toString();
      if (updates.leadTimeDays !== undefined) updateData.leadTimeDays = updates.leadTimeDays;
      if (updates.partType !== undefined) updateData.partType = updates.partType;
      if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
      
      await db
        .update(supplierQuoteLineItems)
        .set(updateData)
        .where(eq(supplierQuoteLineItems.id, lineItemId));
      
      return { success: true };
    }),
  
  /**
   * Approve supplier quote and move data to pricing baseline
   */
  approveQuote: adminProcedure
    .input(z.object({
      quoteId: z.number(),
      approvedLineItemIds: z.array(z.number()), // Admin can approve specific line items
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      // Get quote details
      const [quote] = await db
        .select()
        .from(supplierQuotes)
        .where(eq(supplierQuotes.id, input.quoteId));
      
      if (!quote) {
        throw new Error("Quote not found");
      }
      
      // Get approved line items
      const lineItems = await db
        .select()
        .from(supplierQuoteLineItems)
        .where(eq(supplierQuoteLineItems.quoteId, input.quoteId));
      
      const approvedItems = lineItems.filter(item => 
        input.approvedLineItemIds.includes(item.id)
      );
      
      // Move approved items to pricing baseline
      const baselineInserts = approvedItems.map(item => ({
        partName: item.partName,
        partNumber: item.partNumber,
        partCategory: item.partCategory,
        vehicleMake: item.vehicleMake,
        vehicleModel: item.vehicleModel,
        vehicleYearFrom: item.vehicleYearFrom,
        vehicleYearTo: item.vehicleYearTo,
        saBasePrice: item.price, // Store as-is, will be converted by pricing engine
        currency: item.currency,
        partType: item.partType,
        source: `supplier_quote_${quote.id}`,
        sourceUrl: quote.documentUrl,
        scrapedAt: new Date(),
        lastUpdated: new Date(),
        confidence: "high" as const, // Supplier quotes are high confidence
        dataQuality: JSON.stringify({
          supplierName: quote.supplierName,
          supplierCountry: quote.supplierCountry,
          quoteDate: quote.quoteDate,
          extractionConfidence: quote.extractionConfidence,
        }),
      }));
      
      if (baselineInserts.length > 0) {
        await db.insert(partsPricingBaseline).values(baselineInserts);
      }
      
      // Mark line items as approved
      if (input.approvedLineItemIds.length > 0) {
        await db
          .update(supplierQuoteLineItems)
          .set({ approved: true })
          .where(inArray(supplierQuoteLineItems.id, input.approvedLineItemIds));
      }
      
      // Update quote status
      await db
        .update(supplierQuotes)
        .set({
          status: "approved",
          reviewedAt: new Date(),
          reviewedBy: ctx.user.id,
        })
        .where(eq(supplierQuotes.id, input.quoteId));
      
      // Update supplier performance metrics
      await updateSupplierMetrics(db, quote.supplierName, quote.supplierCountry);
      
      return {
        success: true,
        approvedCount: approvedItems.length,
      };
    }),
  
  /**
   * Reject supplier quote
   */
  rejectQuote: adminProcedure
    .input(z.object({
      quoteId: z.number(),
      rejectionReason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db
        .update(supplierQuotes)
        .set({
          status: "rejected",
          reviewedAt: new Date(),
          reviewedBy: ctx.user.id,
          notes: input.rejectionReason,
        })
        .where(eq(supplierQuotes.id, input.quoteId));
      
      return { success: true };
    }),
  
  /**
   * Get supplier performance metrics
   */
  getSupplierMetrics: adminProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const metrics = await db
        .select()
        .from(supplierPerformanceMetrics)
        .orderBy(desc(supplierPerformanceMetrics.lastQuoteDate));
      
      return metrics;
    }),
});

/**
 * Update supplier performance metrics after quote approval/rejection
 */
async function updateSupplierMetrics(
  db: Awaited<ReturnType<typeof getDb>>,
  supplierName: string,
  supplierCountry: string
) {
  if (!db) return;
  
  // Get existing metrics
  const [existing] = await db
    .select()
    .from(supplierPerformanceMetrics)
    .where(eq(supplierPerformanceMetrics.supplierName, supplierName));
  
  // Get all quotes from this supplier
  const quotes = await db
    .select()
    .from(supplierQuotes)
    .where(eq(supplierQuotes.supplierName, supplierName));
  
  const totalQuotes = quotes.length;
  const approvedQuotes = quotes.filter(q => q.status === "approved").length;
  const rejectedQuotes = quotes.filter(q => q.status === "rejected").length;
  
  // Calculate average extraction confidence
  const avgConfidence = quotes.reduce((sum, q) => {
    const conf = typeof q.extractionConfidence === 'string' ? parseFloat(q.extractionConfidence) : q.extractionConfidence;
    return sum + (conf || 0);
  }, 0) / totalQuotes;
  
  // Get first and last quote dates
  const quoteDates = quotes.map(q => new Date(q.quoteDate)).sort((a, b) => a.getTime() - b.getTime());
  const firstQuoteDate = quoteDates[0];
  const lastQuoteDate = quoteDates[quoteDates.length - 1];
  
  if (existing) {
    // Update existing metrics
    await db
      .update(supplierPerformanceMetrics)
      .set({
        totalQuotesSubmitted: totalQuotes,
        totalQuotesApproved: approvedQuotes,
        totalQuotesRejected: rejectedQuotes,
        avgExtractionConfidence: avgConfidence.toFixed(2),
        lastQuoteDate,
        lastUpdated: new Date(),
      })
      .where(eq(supplierPerformanceMetrics.supplierName, supplierName));
  } else {
    // Create new metrics
    await db.insert(supplierPerformanceMetrics).values({
      supplierName,
      supplierCountry,
      totalQuotesSubmitted: totalQuotes,
      totalQuotesApproved: approvedQuotes,
      totalQuotesRejected: rejectedQuotes,
      avgExtractionConfidence: avgConfidence.toFixed(2),
      firstQuoteDate,
      lastQuoteDate,
      lastUpdated: new Date(),
    });
  }
}
