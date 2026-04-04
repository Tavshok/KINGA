// Direct DB inspection script — run with: node check_cost_db.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load env
import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { sql } from "drizzle-orm";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

// Raw query to inspect cost data for any Mazda BT50 claim
const [rows] = await conn.execute(`
  SELECT 
    c.claim_id,
    c.vehicle_make,
    c.vehicle_model,
    a.cost_intelligence_json,
    a.claim_record_json,
    a.pipeline_run_summary
  FROM claims c
  LEFT JOIN ai_assessments a ON a.claim_id = c.claim_id
  WHERE c.vehicle_model LIKE '%BT%' OR c.vehicle_model LIKE '%Mazda%' OR c.claim_id LIKE '%MAZDA%'
  ORDER BY a.created_at DESC
  LIMIT 5
`);

for (const row of rows) {
  console.log("\n=== CLAIM:", row.claim_id, row.vehicle_make, row.vehicle_model, "===");

  if (row.cost_intelligence_json) {
    const cost = JSON.parse(row.cost_intelligence_json);
    console.log("COST INTELLIGENCE:");
    console.log("  documentedOriginalQuoteUsd:", cost.documentedOriginalQuoteUsd);
    console.log("  documentedAgreedCostUsd:", cost.documentedAgreedCostUsd);
    console.log("  expectedRepairCostCents:", cost.expectedRepairCostCents);
    console.log("  quoteDeviationPct:", cost.quoteDeviationPct);
    console.log("  panelBeaterName:", cost.panelBeaterName);
    console.log("  savingsOpportunityCents:", cost.savingsOpportunityCents);
  } else {
    console.log("COST INTELLIGENCE: null");
  }

  if (row.claim_record_json) {
    const cr = JSON.parse(row.claim_record_json);
    console.log("CLAIM RECORD repairQuote:");
    console.log("  quoteTotalCents:", cr?.repairQuote?.quoteTotalCents);
    console.log("  agreedCostCents:", cr?.repairQuote?.agreedCostCents);
    console.log("  repairerName:", cr?.repairQuote?.repairerName);
    console.log("  repairerCompany:", cr?.repairQuote?.repairerCompany);
    console.log("  lineItems count:", cr?.repairQuote?.lineItems?.length ?? 0);
    console.log("  estimatedSpeedKmh:", cr?.accidentDetails?.estimatedSpeedKmh);
    console.log("  incidentType:", cr?.accidentDetails?.incidentType);
  } else {
    console.log("CLAIM RECORD: null");
  }
}

await conn.end();
console.log("\nDone.");
