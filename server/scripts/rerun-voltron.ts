/**
 * Script to find the most recent claim with a multi-quote PDF and re-run the AI assessment.
 * Run with: cd /home/ubuntu/kinga-replit && npx tsx server/scripts/rerun-voltron.ts
 */
import "dotenv/config";
import { getDb } from "../db";
import { triggerAiAssessment } from "../db";
import { claims } from "../../drizzle/schema";
import { desc, sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Could not connect to database");
    process.exit(1);
  }

  // Find claims with actual PDF documents (source_document_id links to ingestion_documents)
  const recentClaims = await db.execute(sql`
    SELECT c.id, c.claim_number, c.status, c.document_processing_status,
           COUNT(DISTINCT pbq.id) as quote_count,
           c.created_at,
           MAX(ind.original_filename) as original_filename
    FROM claims c
    INNER JOIN ingestion_documents ind ON ind.id = c.source_document_id
    LEFT JOIN panel_beater_quotes pbq ON pbq.claim_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT 20
  `);

  console.log("\n=== Recent Claims ===");
  const rows = (recentClaims as any)[0] || recentClaims;
  const claimList = Array.isArray(rows) ? rows : [];
  
  for (const row of claimList) {
    console.log(`ID: ${row.id} | Claim: ${row.claim_number} | Status: ${row.status} | Quotes: ${row.quote_count} | Created: ${row.created_at}`);
  }

  // Target the most recent Voltron claim (6570001 = DOC-20260520-A14CC1A7)
  const targetClaim = claimList.find((r: any) => r.id === 6570001) || claimList.find((r: any) => parseInt(r.quote_count) === 1) || claimList[0];
  
  if (!targetClaim) {
    console.log("No claims found to re-run");
    process.exit(0);
  }

  console.log(`\n=== Re-running assessment for claim ${targetClaim.id} (${targetClaim.claim_number}) ===`);
  console.log("This will take 3-5 minutes...");
  
  try {
    await triggerAiAssessment(targetClaim.id);
    console.log(`\n✅ Assessment complete for claim ${targetClaim.id}`);
    
    // Check how many quotes were extracted
    const quoteCheck = await db.execute(sql`
      SELECT COUNT(*) as quote_count, GROUP_CONCAT(panel_beater_name SEPARATOR ', ') as panel_beaters
      FROM panel_beater_quotes
      WHERE claim_id = ${targetClaim.id}
    `);
    const qRows = (quoteCheck as any)[0] || quoteCheck;
    const qRow = Array.isArray(qRows) ? qRows[0] : qRows;
    console.log(`\n=== Quote Extraction Result ===`);
    console.log(`Quotes extracted: ${qRow?.quote_count}`);
    console.log(`Panel beaters: ${qRow?.panel_beaters}`);
  } catch (err) {
    console.error("Assessment failed:", err);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(console.error);
