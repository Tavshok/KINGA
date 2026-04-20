import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";

const dbUrl = readFileSync("/tmp/dburl.txt", "utf8").trim();
console.log("Connecting to:", dbUrl.substring(0, 50) + "...");

const db = await createConnection(dbUrl);
console.log("Connected.");

// Check stuck claims
const [stuck] = await db.execute(`
  SELECT id, claim_number, status, document_processing_status, 
         ai_assessment_triggered, workflow_state, updated_at,
         TIMESTAMPDIFF(MINUTE, updated_at, NOW()) as minutes_stuck
  FROM claims 
  WHERE status='assessment_in_progress' 
     OR (document_processing_status IN ('extracting','analysing','parsing') AND ai_assessment_triggered=1)
  ORDER BY updated_at ASC
  LIMIT 20
`);

console.log(`\nFound ${stuck.length} stuck claim(s):`);
for (const row of stuck) {
  console.log(`  ID=${row.id} ${row.claim_number} status=${row.status} dps=${row.document_processing_status} stuck_mins=${row.minutes_stuck}`);
}

if (stuck.length > 0) {
  console.log("\nResetting stuck claims...");
  const [result] = await db.execute(`
    UPDATE claims
    SET status='intake_pending',
        workflow_state='intake_queue',
        document_processing_status='failed',
        ai_assessment_triggered=0,
        updated_at=NOW()
    WHERE status='assessment_in_progress' 
       OR (document_processing_status IN ('extracting','analysing','parsing') AND ai_assessment_triggered=1)
  `);
  console.log(`Reset ${result.affectedRows} claim(s).`);
}

await db.end();
console.log("Done.");
