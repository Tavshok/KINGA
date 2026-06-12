/**
 * Directly trigger the KINGA pipeline for claim 7650001 (Chevrolet ADL8563, DOC-20260612-5B0D73F3)
 * and monitor stage-by-stage progress.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/home/ubuntu/kinga-replit/.env' });

const CLAIM_ID = 7650001;
const PROD_BASE_URL = 'https://kingaai-ybs42lwg.manus.space';

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

async function pollStatus(conn) {
  const [rows] = await conn.execute(
    `SELECT document_processing_status, pipeline_current_stage, ai_assessment_triggered, 
            ai_assessment_completed, updated_at
     FROM claims WHERE id = ?`,
    [CLAIM_ID]
  );
  return rows[0] || null;
}

async function checkQuotes(conn) {
  try {
    const [rows] = await conn.execute(
      `SELECT repairer_name, total_amount, currency FROM repair_quotes WHERE claim_id = ? ORDER BY total_amount ASC`,
      [CLAIM_ID]
    );
    return rows;
  } catch {
    return null;
  }
}

async function checkDamagePhotos(conn) {
  try {
    // Try ai_assessments for enriched photos JSON
    const [rows] = await conn.execute(
      `SELECT enriched_photos_json FROM ai_assessments WHERE claim_id = ? ORDER BY created_at DESC LIMIT 1`,
      [CLAIM_ID]
    );
    if (rows[0]?.enriched_photos_json) {
      const photos = JSON.parse(rows[0].enriched_photos_json);
      return Array.isArray(photos) ? photos.length : 'present';
    }
    return 0;
  } catch {
    return 'unknown';
  }
}

async function main() {
  const conn = await mysql.createConnection(parseDbUrl(process.env.DATABASE_URL));

  // Check current state
  const initial = await pollStatus(conn);
  console.log(`[${new Date().toISOString()}] Initial state:`);
  console.log(`  Status: ${initial?.document_processing_status} | Stage: ${initial?.pipeline_current_stage} | Triggered: ${initial?.ai_assessment_triggered} | Completed: ${initial?.ai_assessment_completed}`);

  // Reset the claim to allow re-triggering
  console.log('\nResetting claim to intake_pending to allow fresh pipeline run...');
  await conn.execute(
    `UPDATE claims SET 
       ai_assessment_triggered = 0,
       ai_assessment_completed = 0,
       document_processing_status = 'intake_pending',
       pipeline_current_stage = NULL,
       updated_at = NOW()
     WHERE id = ?`,
    [CLAIM_ID]
  );
  console.log('Reset done.');

  // Now trigger via the internal triggerAiAssessment by calling the server's internal endpoint
  // Since we can't call tRPC directly without auth, we'll use the DB to set the trigger flag
  // and let the stuck-recovery job pick it up, OR we call triggerAiAssessment directly via Node
  console.log('\nTriggering pipeline directly via Node import...');
  
  await conn.end();

  // Import and call the real pipeline function directly
  process.env.NODE_ENV = 'production';
  const { triggerAiAssessment } = await import('/home/ubuntu/kinga-replit/server/db.ts');
  
  console.log(`[${new Date().toISOString()}] Pipeline triggered for claim ${CLAIM_ID}. Monitoring...`);

  // Reconnect for monitoring
  const monConn = await mysql.createConnection(parseDbUrl(process.env.DATABASE_URL));
  
  let lastStage = null;
  let lastStatus = null;
  let iterations = 0;
  const MAX_ITERATIONS = 24; // 12 minutes

  const pipelinePromise = triggerAiAssessment(CLAIM_ID);

  // Monitor while pipeline runs
  const monitorInterval = setInterval(async () => {
    iterations++;
    const s = await pollStatus(monConn);
    if (!s) return;

    if (s.pipeline_current_stage !== lastStage || s.document_processing_status !== lastStatus) {
      console.log(`[${new Date().toISOString()}] Stage: ${s.pipeline_current_stage || 'none'} | Status: ${s.document_processing_status} | Completed: ${s.ai_assessment_completed}`);
      lastStage = s.pipeline_current_stage;
      lastStatus = s.document_processing_status;
    }

    if (iterations >= MAX_ITERATIONS) {
      clearInterval(monitorInterval);
      console.log('\n⏱ Monitor timed out.');
      await monConn.end();
    }
  }, 30000);

  try {
    await pipelinePromise;
    clearInterval(monitorInterval);
    console.log(`\n[${new Date().toISOString()}] ✅ Pipeline completed!`);

    // Check results
    const quotes = await checkQuotes(monConn);
    if (quotes) {
      console.log(`\nQuotes extracted (${quotes.length}):`);
      for (const q of quotes) {
        console.log(`  - ${q.repairer_name}: ${q.currency} ${q.total_amount}`);
      }
    }

    const photoCount = await checkDamagePhotos(monConn);
    console.log(`\nDamage photos: ${photoCount}`);

  } catch (err) {
    clearInterval(monitorInterval);
    console.error(`\n❌ Pipeline error: ${err.message}`);
  }

  await monConn.end();
}

main().catch(console.error);
