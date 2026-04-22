/**
 * Check what Stage 3 extracted for a specific claim - police report fields and claimRecord
 */
import { getDb } from "../server/db";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const claimId = 4560009;

  // Get the aiAssessment for this claim
  const rows = await (db as any).$client.pool.promise().query(
    `SELECT 
      claim_record_json,
      parts_reconciliation_json
     FROM ai_assessments 
     WHERE claim_id = ? 
     ORDER BY created_at DESC 
     LIMIT 1`,
    [claimId]
  );

  const row = (rows as any)[0]?.[0];
  if (!row) { console.log("No assessment found for claim", claimId); process.exit(0); }

  const claimRecord = row.claim_record_json ? JSON.parse(row.claim_record_json) : null;
  if (claimRecord) {
    console.log("\n=== Police Report from claimRecord ===");
    console.log(JSON.stringify(claimRecord.policeReport, null, 2));

    console.log("\n=== Damage Components (first 5) ===");
    const comps = claimRecord.damage?.damagedComponents ?? claimRecord.damage?.components ?? [];
    console.log(JSON.stringify(comps.slice(0, 5), null, 2));
    console.log(`Total damage components: ${comps.length}`);

    console.log("\n=== Extracted Quotes ===");
    const quotes = claimRecord.extractedQuotes ?? claimRecord.repairQuote ?? null;
    console.log(JSON.stringify(quotes, null, 2));
  }

  if (row.parts_reconciliation_json) {
    const recon = JSON.parse(row.parts_reconciliation_json);
    console.log("\n=== Parts Reconciliation (first 5 components) ===");
    console.log(JSON.stringify(recon.slice(0, 5), null, 2));
    const withQuotes = recon.filter((r: any) => r.quotedAmount != null);
    console.log(`\nComponents with quotedAmount: ${withQuotes.length}/${recon.length}`);
    if (withQuotes.length > 0) {
      console.log("Sample with quotedAmount:", JSON.stringify(withQuotes.slice(0, 3), null, 2));
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
