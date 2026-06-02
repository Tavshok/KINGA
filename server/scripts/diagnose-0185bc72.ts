import "dotenv/config";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) { console.error("No DB"); process.exit(1); }

  const claimId = 6990001;

  // 1. Basic claim record
  const claimResult = await db.execute(sql`
    SELECT id, claim_number, status, document_processing_status,
           vehicle_vin, incident_date, incident_description, created_at
    FROM claims WHERE id = ${claimId}
  `);
  const claimRows = (claimResult as any)[0] || claimResult;
  const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
  console.log("=== 1. CLAIM RECORD ===");
  console.log(JSON.stringify(claim, null, 2));

  // 2. AI Assessment record
  const aiResult = await db.execute(sql`
    SELECT id, claim_id, fraud_risk_level, fraud_score, recommendation,
           confidence_score, estimated_cost, damage_description,
           LENGTH(fraud_score_breakdown_json) as fsbj_len,
           LENGTH(physics_analysis) as physics_len,
           LENGTH(forensic_analysis) as forensic_len,
           LENGTH(damaged_components_json) as dcj_len,
           LENGTH(repair_intelligence_json) as rij_len,
           LENGTH(cost_intelligence_json) as cij_len,
           created_at
    FROM ai_assessments WHERE claim_id = ${claimId}
    ORDER BY created_at DESC LIMIT 3
  `);
  const aiRows = (aiResult as any)[0] || aiResult;
  console.log("\n=== 2. AI ASSESSMENTS ===");
  console.log(JSON.stringify(Array.isArray(aiRows) ? aiRows : [aiRows], null, 2));

  // 3. Check forensic_analysis content
  const faResult = await db.execute(sql`
    SELECT id, forensic_analysis FROM ai_assessments
    WHERE claim_id = ${claimId} ORDER BY created_at DESC LIMIT 1
  `);
  const faRows = (faResult as any)[0] || faResult;
  const faRow = Array.isArray(faRows) ? faRows[0] : faRows;
  const fa = faRow ? faRow.forensic_analysis : null;
  console.log("\n=== 3. FORENSIC ANALYSIS ===");
  if (!fa) {
    console.log("forensic_analysis is NULL — pipeline did not write stage data");
  } else {
    try {
      const parsed = JSON.parse(fa as string);
      console.log("Top-level keys:", Object.keys(parsed));
      if (parsed.stage1) {
        console.log("stage1.claimantName:", parsed.stage1.claimantName);
        console.log("stage1.vehicleVin:", parsed.stage1.vehicleVin);
        console.log("stage1.extractionConfidence:", parsed.stage1.extractionConfidence);
      }
    } catch (e) {
      console.log("Parse error:", (e as Error).message);
      console.log("Raw (first 300):", (fa as string).substring(0, 300));
    }
  }

  // 4. Check panel_beater_quotes
  const pbqResult = await db.execute(sql`
    SELECT id, panel_beater_name, total_quoted_amount, created_at
    FROM panel_beater_quotes WHERE claim_id = ${claimId}
    ORDER BY created_at DESC LIMIT 5
  `);
  const pbqRows = (pbqResult as any)[0] || pbqResult;
  console.log("\n=== 4. PANEL BEATER QUOTES ===");
  console.log(JSON.stringify(Array.isArray(pbqRows) ? pbqRows : [pbqRows], null, 2));

  // 5. Check claim_truth_layers
  const ctlResult = await db.execute(sql`
    SELECT id, claim_id, created_at, LENGTH(policy_and_recovery_json) as pol_len,
           LENGTH(incident_reconstruction_json) as inc_len
    FROM claim_truth_layers WHERE claim_id = ${claimId}
    ORDER BY created_at DESC LIMIT 3
  `).catch(() => ({ 0: [] }));
  const ctlRows = (ctlResult as any)[0] || ctlResult;
  console.log("\n=== 5. CLAIM TRUTH LAYERS ===");
  console.log(JSON.stringify(Array.isArray(ctlRows) ? ctlRows : [ctlRows], null, 2));

  process.exit(0);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
