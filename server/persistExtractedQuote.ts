/**
 * persistExtractedQuote.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for writing an extracted/uploaded quote to the
 * panel_beater_quotes + quote_line_items tables.
 *
 * Every quote ingestion route MUST call this function:
 *   Route 1 — Pipeline PDF extraction  (called from db.ts after pipeline completes)
 *   Route 2 — Separate document upload (called from routers.ts uploadDocument mutation)
 *   Route 3 — Client upload            (called from routers.ts claimant upload path)
 *   Route 4 — Panel beater portal      (already calls createPanelBeaterQuote directly;
 *                                        this helper adds an idempotency guard)
 *
 * Design principles:
 *   • Idempotent — calling twice for the same claim + panel beater produces one row
 *   • Non-destructive — never deletes manually-submitted quotes from other panel beaters
 *   • Source-tagged — every row carries the source in the notes field for audit trails
 *   • Graceful — all errors are caught and logged; never throws to the caller
 */

import { getDb } from "./db";
import { panelBeaters, panelBeaterQuotes, quoteLineItems } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface ExtractedLineItem {
  description: string;
  partNumber?: string | null;
  category?: "parts" | "labor" | "paint" | "diagnostic" | "sundries" | "other";
  quantity?: number;
  unitPrice?: number;  // in whole currency units (not cents)
  lineTotal?: number;  // in whole currency units
  isRepair?: boolean;
  isReplacement?: boolean;
  notes?: string | null;
}

export interface ExtractedQuoteInput {
  claimId: number;
  tenantId?: string | null;
  /** Name of the repairer as extracted from the document */
  repairerName?: string | null;
  /** Total quoted amount in whole currency units (e.g. 1500.00 for $1,500) */
  quotedAmountUnits: number;
  /** Labour cost in whole currency units */
  labourCostUnits?: number | null;
  /** Parts cost in whole currency units */
  partsCostUnits?: number | null;
  /** Currency code, defaults to 'USD' */
  currency?: string;
  /** Line items extracted from the document */
  lineItems?: ExtractedLineItem[];
  /** Where this quote came from — used for audit trail */
  source: "pipeline_extracted" | "document_upload" | "client_upload";
}

/**
 * Upsert an extracted quote into panel_beater_quotes.
 *
 * Strategy:
 *   1. Find or create a panel beater record for the repairer name.
 *   2. Look for an existing quote for this claim from that panel beater.
 *      If one exists, update it (idempotent re-run support).
 *      If none exists, insert a new row.
 *   3. Delete and re-insert line items so re-runs always reflect the latest extraction.
 *
 * Returns the quote ID on success, null on failure.
 */
export async function persistExtractedQuote(input: ExtractedQuoteInput): Promise<number | null> {
  const tag = `[persistExtractedQuote] Claim ${input.claimId}`;
  try {
    const db = await getDb();
    if (!db) {
      console.warn(`${tag}: DB not available — skipping quote persistence`);
      return null;
    }

    // Convert whole-unit amounts to cents for storage (DB stores amounts as int cents)
    // If quotedAmountUnits is null/0 but line items have prices, compute total from line items
    // so a handwritten quote with readable line items but unclear total is not silently dropped.
    let resolvedAmountUnits = input.quotedAmountUnits ?? 0;
    if (resolvedAmountUnits <= 0 && input.lineItems && input.lineItems.length > 0) {
      const lineItemSum = input.lineItems.reduce((sum, li) => sum + (li.lineTotal ?? li.unitPrice ?? 0), 0);
      if (lineItemSum > 0) {
        console.log(`${tag}: quotedAmountUnits=0 but line items sum to ${lineItemSum} — using line item sum as total`);
        resolvedAmountUnits = lineItemSum;
      }
    }
    const quotedAmountCents = Math.round(resolvedAmountUnits * 100);
    if (quotedAmountCents <= 0) {
      console.warn(`${tag}: quotedAmountUnits=${input.quotedAmountUnits} and no line item prices — skipping`);
      return null;
    }
    const labourCostCents = input.labourCostUnits != null ? Math.round(input.labourCostUnits * 100) : null;
    const partsCostCents = input.partsCostUnits != null ? Math.round(input.partsCostUnits * 100) : null;
    // Normalise currency symbols to ISO 4217 codes
    const _rawCurrency = (input.currency ?? 'USD').trim();
    const CURRENCY_SYMBOL_MAP: Record<string, string> = {
      '$': 'USD', 'US$': 'USD', 'USD': 'USD',
      'Z$': 'ZWL', 'ZWL': 'ZWL', 'ZIG': 'ZIG',
      'R': 'ZAR', 'ZAR': 'ZAR',
      'K': 'ZMW', 'ZMW': 'ZMW',
      'KES': 'KES', 'GHS': 'GHS', 'NGN': 'NGN',
      '\u00a3': 'GBP', 'GBP': 'GBP',
      '\u20ac': 'EUR', 'EUR': 'EUR',
    };
    const currencyCode = (CURRENCY_SYMBOL_MAP[_rawCurrency] ?? _rawCurrency.toUpperCase()).substring(0, 10);
    const repairerName = (input.repairerName ?? "Extracted Repairer").substring(0, 200);
    const sourceNote = `[${input.source}]`;

    // ── Step 1: Find or create a panel beater record for this repairer ──────
    let panelBeaterId: number;
    const existingPb = await db.select({ id: panelBeaters.id })
      .from(panelBeaters)
      .where(eq(panelBeaters.businessName, repairerName))
      .limit(1);

    if (existingPb.length > 0) {
      panelBeaterId = existingPb[0].id;
    } else {
      // Create a new panel beater record for this repairer
      const insertResult = await db.insert(panelBeaters).values({
        name: repairerName,
        businessName: repairerName,
        approved: 1,
        tenantId: input.tenantId ?? null,
      } as any);
      panelBeaterId = (insertResult as any).insertId ?? (insertResult as any)[0]?.insertId;
      if (!panelBeaterId) {
        // Fallback: re-query
        const [newPb] = await db.select({ id: panelBeaters.id })
          .from(panelBeaters)
          .where(eq(panelBeaters.businessName, repairerName))
          .limit(1);
        panelBeaterId = newPb?.id;
      }
      console.log(`${tag}: Created panel beater "${repairerName}" (id=${panelBeaterId})`);
    }

    if (!panelBeaterId) {
      console.error(`${tag}: Could not resolve panel beater ID — aborting`);
      return null;
    }

    // ── Step 2: Upsert the panel_beater_quotes row ───────────────────────────
    // GUARD: Also check for quotes from panel beaters with similar names for this claim.
    // This prevents duplicate rows when the same repairer is extracted with slightly
    // different name spellings across pipeline runs (e.g. "Emilio's Spray Painters"
    // vs "Emilio's Spray Paint...").
    // Strategy: load all pipeline-extracted quotes for this claim, normalise their
    // associated panel beater names, and if a fuzzy match exists use that quote's ID.
    const allClaimQuotes = await db
      .select({ id: panelBeaterQuotes.id, pbName: panelBeaters.businessName, pbId: panelBeaters.id })
      .from(panelBeaterQuotes)
      .innerJoin(panelBeaters, eq(panelBeaterQuotes.panelBeaterId, panelBeaters.id))
      .where(eq(panelBeaterQuotes.claimId, input.claimId));

    const normRepairerName = repairerName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const fuzzyMatch = allClaimQuotes.find(q => {
      const normExisting = (q.pbName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      // Match if either name contains the first 8 chars of the other (fuzzy prefix match)
      const prefix = Math.min(8, normRepairerName.length, normExisting.length);
      return prefix >= 4 && (
        normExisting.startsWith(normRepairerName.slice(0, prefix)) ||
        normRepairerName.startsWith(normExisting.slice(0, prefix))
      );
    });

    if (fuzzyMatch && fuzzyMatch.pbId !== panelBeaterId) {
      console.log(`${tag}: Fuzzy name match — repairer "${repairerName}" matches existing panel beater id=${fuzzyMatch.pbId} ("${fuzzyMatch.pbName}") — using existing panel beater to prevent duplicate`);
      panelBeaterId = fuzzyMatch.pbId;
    }

    const existingQuotes = await db.select({ id: panelBeaterQuotes.id })
      .from(panelBeaterQuotes)
      .where(and(
        eq(panelBeaterQuotes.claimId, input.claimId),
        eq(panelBeaterQuotes.panelBeaterId, panelBeaterId),
      ))
      .limit(1);

    let quoteId: number;

    if (existingQuotes.length > 0) {
      // Update existing quote (idempotent re-run)
      quoteId = existingQuotes[0].id;
      await db.update(panelBeaterQuotes).set({
        quotedAmount: quotedAmountCents,
        laborCost: labourCostCents,
        partsCost: partsCostCents,
        currencyCode,
        notes: sourceNote,
        status: "submitted",
        updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      }).where(eq(panelBeaterQuotes.id, quoteId));
      console.log(`${tag}: Updated existing quote id=${quoteId} (${input.source})`);
    } else {
      // Insert new quote
      const insertResult = await db.insert(panelBeaterQuotes).values({
        claimId: input.claimId,
        panelBeaterId,
        quotedAmount: quotedAmountCents,
        laborCost: labourCostCents,
        partsCost: partsCostCents,
        currencyCode,
        notes: sourceNote,
        status: "submitted",
        tenantId: input.tenantId ?? null,
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        updatedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      } as any);
      quoteId = (insertResult as any).insertId ?? (insertResult as any)[0]?.insertId;
      if (!quoteId) {
        const [newQ] = await db.select({ id: panelBeaterQuotes.id })
          .from(panelBeaterQuotes)
          .where(and(
            eq(panelBeaterQuotes.claimId, input.claimId),
            eq(panelBeaterQuotes.panelBeaterId, panelBeaterId),
          ))
          .limit(1);
        quoteId = newQ?.id;
      }
      console.log(`${tag}: Inserted new quote id=${quoteId} (${input.source})`);
    }

    if (!quoteId) {
      console.error(`${tag}: Could not resolve quote ID after upsert — line items skipped`);
      return null;
    }

    // ── Step 3: Replace line items ───────────────────────────────────────────
    const lineItems = input.lineItems ?? [];
    if (lineItems.length > 0) {
      // Delete existing line items for this quote
      await db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, quoteId));

      // Insert new line items
      const validCategories = ["parts", "labor", "paint", "diagnostic", "sundries", "other"] as const;
      const lineItemValues = lineItems.map((li, idx) => {
        const qty = li.quantity ?? 1;
        const unitPrice = li.unitPrice ?? 0;
        const lineTotal = li.lineTotal ?? (qty * unitPrice);
        const category: typeof validCategories[number] = validCategories.includes(li.category as any)
          ? (li.category as typeof validCategories[number])
          : "parts";
        return {
          quoteId,
          itemNumber: idx + 1,
          description: (li.description ?? "Item").substring(0, 499),
          partNumber: li.partNumber ? li.partNumber.substring(0, 99) : null,
          category,
          quantity: qty.toFixed(2),
          unitPrice: unitPrice.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          currency: currencyCode,
          isRepair: li.isRepair ? 1 : 0,
          isReplacement: li.isReplacement !== false ? 1 : 0,
          notes: li.notes ? li.notes.substring(0, 499) : null,
        };
      });

      await db.insert(quoteLineItems).values(lineItemValues as any);
      console.log(`${tag}: Inserted ${lineItemValues.length} line items for quote id=${quoteId}`);
    }

    return quoteId;
  } catch (err: any) {
    console.error(`[persistExtractedQuote] Claim ${input.claimId}: FAILED — ${err?.message ?? err}`);
    return null;
  }
}
