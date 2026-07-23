import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  // Check all quote-related tables
  const tables = await db.execute(sql`SHOW TABLES LIKE '%quote%'`);
  console.log('Quote tables:', JSON.stringify((tables as any).rows?.map((r: any) => Object.values(r)[0])));

  // Check panel_beater_quotes columns
  const cols = await db.execute(sql`DESCRIBE panel_beater_quotes`);
  console.log('Columns:', JSON.stringify((cols as any).rows?.map((r: any) => r.Field)));

  // Check components_json for claim 8880001
  const quotes = await db.execute(sql`SELECT id, panel_beater_name, total_amount_cents, components_json FROM panel_beater_quotes WHERE claim_id = 8880001`);
  for (const q of (quotes as any).rows ?? []) {
    const comp = q.components_json;
    const len = comp ? (Array.isArray(comp) ? comp.length : (typeof comp === 'object' ? Object.keys(comp).length : String(comp).length)) : 0;
    console.log(`Quote ${q.id} (${q.panel_beater_name}): total=${q.total_amount_cents} cents, components_json=${comp === null ? 'NULL' : comp === undefined ? 'UNDEFINED' : typeof comp + ' len=' + len}`);
    if (comp && Array.isArray(comp) && comp.length > 0) {
      console.log('  First item:', JSON.stringify(comp[0]));
    }
  }

  // Check if there's a separate quote_line_items table
  const lineItemTables = await db.execute(sql`SHOW TABLES LIKE '%line_item%'`);
  console.log('Line item tables:', JSON.stringify((lineItemTables as any).rows?.map((r: any) => Object.values(r)[0])));

  // Check cost_intelligence_json quotes array for claim 8880001
  const assessment = await db.execute(sql`SELECT cost_intelligence_json FROM ai_assessments WHERE claim_id = 8880001 ORDER BY id DESC LIMIT 1`);
  const costIntel = (assessment as any).rows?.[0]?.cost_intelligence_json;
  if (costIntel) {
    const ci = typeof costIntel === 'string' ? JSON.parse(costIntel) : costIntel;
    const quotes2 = ci.quotes ?? [];
    console.log(`cost_intelligence_json.quotes count: ${quotes2.length}`);
    for (const q of quotes2) {
      const items = q.components ?? q.line_items ?? q.lineItems ?? [];
      console.log(`  Quote "${q.panel_beater ?? q.panelBeater}": total=${q.total_cost ?? q.totalCost}, items=${items.length}`);
      if (items.length > 0) console.log('    First item:', JSON.stringify(items[0]));
    }
    // Check resolvedExtractedQuotes in the output
    const resolvedQ = ci.extracted_quotes ?? ci.extractedQuotes ?? [];
    console.log(`cost_intelligence_json.extracted_quotes count: ${resolvedQ.length}`);
    for (const q of resolvedQ) {
      const items = q.components ?? q.line_items ?? q.lineItems ?? [];
      console.log(`  Extracted quote "${q.panel_beater}": total=${q.total_cost}, items=${items.length}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
