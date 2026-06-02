import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  // Get claim 6990001 (DOC-20260602-0185BC72) basic details
  const result = await db.execute(sql`
    SELECT 
      c.id, c.claim_number, c.status, c.document_processing_status,
      c.vehicle_vin, c.incident_date, c.incident_description,
      c.created_at,
      COUNT(DISTINCT pbq.id) as quote_count,
      MAX(ind.original_filename) as filename
    FROM claims c
    LEFT JOIN panel_beater_quotes pbq ON pbq.claim_id = c.id
    LEFT JOIN ingestion_documents ind ON ind.id = c.source_document_id
    WHERE c.id = 6990001
    GROUP BY c.id
  `);
  
  const rows = (result as any)[0] || result;
  const row = Array.isArray(rows) ? rows[0] : rows;
  console.log("=== CLAIM RECORD ===");
  console.log(JSON.stringify(row, null, 2));
  
  // Check ai_assessments table for this claim
  const aiResult = await db.execute(sql`
    SELECT 
      id, claim_id, fraud_risk_level, fraud_score, recommendation,
      confidence_score, estimated_cost,
      LENGTH(fraud_score_breakdown_json) as fsbj_len,
      LENGTH(physics_analysis) as physics_len,
      LENGTH(forensic_analysis) as forensic_len,
      LENGTH(damage_description) as damage_len,
      created_at
    FROM ai_assessments
    WHERE claim_id = 6990001
    ORDER BY created_at DESC
    LIMIT 3
  `);
  
  const aiRows = (aiResult as any)[0] || aiResult;
  console.log("\n=== AI ASSESSMENTS ===");
  console.log(JSON.stringify(Array.isArray(aiRows) ? aiRows : [aiRows], null, 2));

  // Check ingestion_documents for this claim
  const docResult = await db.execute(sql`
    SELECT id, original_filename, processing_status, document_type, created_at
    FROM ingestion_documents
    WHERE claim_id = 6990001
    ORDER BY created_at DESC
    LIMIT 5
  `);
  const docRows = (docResult as any)[0] || docResult;
  console.log("\n=== INGESTION DOCUMENTS ===");
  console.log(JSON.stringify(Array.isArray(docRows) ? docRows : [docRows], null, 2));

  // Check if there's a forensic_analysis JSON with stage data
  const forensicResult = await db.execute(sql`
    SELECT 
      JSON_EXTRACT(forensic_analysis, '$.stage1') IS NOT NULL as has_stage1,
      JSON_EXTRACT(forensic_analysis, '$.stage2') IS NOT NULL as has_stage2,
      JSON_EXTRACT(forensic_analysis, '$.stage3') IS NOT NULL as has_stage3,
      JSON_EXTRACT(forensic_analysis, '$.stage7') IS NOT NULL as has_stage7,
      JSON_EXTRACT(forensic_analysis, '$.stage8') IS NOT NULL as has_stage8,
      JSON_EXTRACT(forensic_analysis, '$.stage1.claimantName') as claimant_name,
      JSON_EXTRACT(forensic_analysis, '$.stage1.vehicleVin') as vin,
      JSON_EXTRACT(forensic_analysis, '$.stage1.incidentDate') as incident_date
    FROM ai_assessments
    WHERE claim_id = 6990001
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const fRows = (forensicResult as any)[0] || forensicResult;
  console.log("\n=== FORENSIC ANALYSIS STAGE CONTENTS ===");
  console.log(JSON.stringify(Array.isArray(fRows) ? fRows[0] : fRows, null, 2));
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
