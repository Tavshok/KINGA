/**
 * Monitor the Chevrolet Trailblazer ADL8563 pipeline run on the published server.
 * Finds the claim by vehicle registration, triggers reanalysis, then polls for completion.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/kinga-replit/.env' });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse mysql2 connection from DATABASE_URL
function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || '3306'),
    user: u.username,
    password: u.password,
    database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
  };
}

async function main() {
  const conn = await mysql.createConnection(parseDbUrl(DB_URL));

  // Find the Chevrolet claim
  const [rows] = await conn.execute(
    `SELECT id, claim_number, vehicle_registration, document_processing_status, 
            ai_assessment_triggered, ai_assessment_completed, pipeline_current_stage,
            workflow_state, updated_at
     FROM claims 
     WHERE vehicle_registration LIKE '%ADL%' OR vehicle_registration LIKE '%8563%'
        OR claim_number LIKE '%NHARINGO%' OR claim_number LIKE '%Chevrolet%'
     ORDER BY created_at DESC LIMIT 5`
  );

  if (!rows.length) {
    // Try broader search
    const [allRows] = await conn.execute(
      `SELECT id, claim_number, vehicle_registration, document_processing_status, 
              ai_assessment_triggered, ai_assessment_completed, pipeline_current_stage,
              workflow_state, updated_at
       FROM claims ORDER BY created_at DESC LIMIT 15`
    );
    console.log('Recent claims:');
    for (const r of allRows) {
      console.log(`  ID=${r.id} | ${r.claim_number} | ${r.vehicle_registration} | status=${r.document_processing_status} | stage=${r.pipeline_current_stage}`);
    }
    await conn.end();
    return;
  }

  console.log('Found Chevrolet claims:');
  for (const r of rows) {
    console.log(`  ID=${r.id} | ${r.claim_number} | ${r.vehicle_registration} | status=${r.document_processing_status} | stage=${r.pipeline_current_stage} | triggered=${r.ai_assessment_triggered} | completed=${r.ai_assessment_completed}`);
  }

  const claimId = rows[0].id;
  console.log(`\nUsing claim ID: ${claimId}`);

  // Poll for pipeline progress
  console.log('\nPolling for pipeline progress (30s intervals)...\n');
  let lastStage = null;
  let iterations = 0;
  const MAX_ITERATIONS = 20; // 10 minutes max

  while (iterations < MAX_ITERATIONS) {
    await new Promise(r => setTimeout(r, 30000));
    iterations++;

    const [statusRows] = await conn.execute(
      `SELECT document_processing_status, pipeline_current_stage, ai_assessment_triggered, 
              ai_assessment_completed, updated_at
       FROM claims WHERE id = ?`,
      [claimId]
    );

    if (!statusRows.length) {
      console.log('Claim not found in poll');
      break;
    }

    const s = statusRows[0];
    const stage = s.pipeline_current_stage;
    const status = s.document_processing_status;

    if (stage !== lastStage) {
      console.log(`[${new Date().toISOString()}] Stage: ${stage || 'none'} | Status: ${status} | Completed: ${s.ai_assessment_completed}`);
      lastStage = stage;
    }

    if (s.ai_assessment_completed === 1 || status === 'completed' || status === 'failed') {
      console.log(`\n✅ Pipeline finished. Status: ${status} | Completed: ${s.ai_assessment_completed}`);

      // Check how many quotes were extracted
      const [quoteRows] = await conn.execute(
        `SELECT COUNT(*) as quote_count FROM repair_quotes WHERE claim_id = ?`,
        [claimId]
      );
      console.log(`\nQuotes extracted: ${quoteRows[0].quote_count}`);

      // Check damage photos
      const [photoRows] = await conn.execute(
        `SELECT COUNT(*) as photo_count FROM damage_photos WHERE claim_id = ?`,
        [claimId]
      );
      console.log(`Damage photos: ${photoRows[0]?.photo_count ?? 'N/A (table may differ)'}`);

      break;
    }
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log('\n⏱ Polling timed out after 10 minutes.');
  }

  await conn.end();
}

main().catch(console.error);
