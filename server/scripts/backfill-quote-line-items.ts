/**
 * Safely restores historical Stage 9 documentedLineItems to quote_line_items.
 *
 * Default operation is dry-run. Writing requires both --apply and --claim=<id>.
 * The utility never replaces existing quote line items and skips ambiguous
 * multi-quote mappings rather than risking an incorrect repairer allocation.
 *
 * Usage:
 *   pnpm tsx server/scripts/backfill-quote-line-items.ts --claim=12879902
 *   pnpm tsx server/scripts/backfill-quote-line-items.ts --claim=12879902 --apply
 */
// @ts-nocheck
import { and, desc, eq } from "drizzle-orm";
import { aiAssessments, panelBeaterQuotes, quoteLineItems } from "../../drizzle/schema";
import { getDb } from "../db-core";
import { buildHistoricalLineItemValues } from "../quote-line-item-backfill";

const claimArg = process.argv.find((arg) => arg.startsWith("--claim="));
const claimId = Number(claimArg?.split("=")[1]);
const apply = process.argv.includes("--apply");

if (!Number.isInteger(claimId) || claimId <= 0) {
  throw new Error("A single numeric claim is required. Example: --claim=12879902");
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [assessment] = await db
    .select({ id: aiAssessments.id, costIntelligenceJson: aiAssessments.costIntelligenceJson })
    .from(aiAssessments)
    .where(eq(aiAssessments.claimId, claimId))
    .orderBy(desc(aiAssessments.createdAt))
    .limit(1);

  if (!assessment?.costIntelligenceJson) {
    console.log(`[LineItemBackfill] Claim ${claimId}: no assessment cost intelligence found`);
    return;
  }

  let costIntel: any;
  try {
    costIntel = JSON.parse(assessment.costIntelligenceJson);
  } catch {
    throw new Error(`[LineItemBackfill] Claim ${claimId}: invalid cost_intelligence_json`);
  }

  const documentedItems: any[] = Array.isArray(costIntel.documentedLineItems)
    ? costIntel.documentedLineItems
    : [];
  if (documentedItems.length === 0) {
    console.log(`[LineItemBackfill] Claim ${claimId}: no documentedLineItems available; nothing to restore`);
    return;
  }

  const quotes = await db
    .select({ id: panelBeaterQuotes.id, currencyCode: panelBeaterQuotes.currencyCode })
    .from(panelBeaterQuotes)
    .where(eq(panelBeaterQuotes.claimId, claimId))
    .orderBy(panelBeaterQuotes.id);

  if (quotes.length === 0) {
    console.log(`[LineItemBackfill] Claim ${claimId}: no quote rows available; preserve Stage 9 data and do not infer a repairer`);
    return;
  }

  let restored = 0;
  for (let quoteIndex = 0; quoteIndex < quotes.length; quoteIndex += 1) {
    const quote = quotes[quoteIndex];
    const existing = await db
      .select({ id: quoteLineItems.id })
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, quote.id))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[LineItemBackfill] Quote ${quote.id}: already has line items — skipped`);
      continue;
    }

    const matching = documentedItems.filter((item) => {
      if (typeof item.source_quote_index === "number") return item.source_quote_index === quoteIndex;
      return quotes.length === 1;
    });
    const values = buildHistoricalLineItemValues(quote.id, quote.currencyCode ?? "USD", matching);
    if (values.length === 0) {
      console.log(`[LineItemBackfill] Quote ${quote.id}: no unambiguous priced items — skipped`);
      continue;
    }

    console.log(`[LineItemBackfill] Quote ${quote.id}: ${values.length} candidate line item(s)${apply ? " — writing" : " — dry run"}`);
    if (apply) {
      await db.insert(quoteLineItems).values(values as any);
      restored += values.length;
    }
  }

  console.log(`[LineItemBackfill] Claim ${claimId}: ${apply ? `restored ${restored} line item(s)` : "dry run complete; rerun with --apply to write"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
