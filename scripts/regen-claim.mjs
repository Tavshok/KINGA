/**
 * regen-claim.mjs
 * Resets DOC-20260802-AE62B9CF to intake_pending so the pipeline re-runs
 * with the three photo zone-label fixes (A, B, C) applied.
 *
 * Usage: node scripts/regen-claim.mjs
 */
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const CLAIM_REF = "DOC-20260802-AE62B9CF";
const REASON    = "Photo zone-label audit: applying fixes A+B+C (directionContradiction flag, stale-default removal, source marker). Regenerating CL/CI/FR for manual review.";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // 1. Look up the claim
  const [rows] = await conn.execute(
    "SELECT id, claim_reference, status, document_processing_status FROM claims WHERE claim_reference = ? LIMIT 1",
    [CLAIM_REF]
  );

  if (!rows.length) {
    console.error(`❌ Claim ${CLAIM_REF} not found`);
    process.exit(1);
  }

  const claim = rows[0];
  console.log(`Found claim: id=${claim.id}, ref=${claim.claim_reference}, status=${claim.status}`);

  const REGENERATABLE = [
    "intake_pending","document_processing_failed","assessment_failed","in_review",
    "completed","assessment_complete","analysis_complete","fraud_review","human_review_required"
  ];
  if (!REGENERATABLE.includes(claim.status)) {
    console.error(`❌ Claim is in state '${claim.status}' which is not regeneratable`);
    process.exit(1);
  }

  // admin_pipeline_regenerations uses BIGINT for timestamps
  const nowMs  = Date.now();
  // claims.updated_at uses DATETIME — use ISO string without ms
  const nowDt  = new Date(nowMs).toISOString().slice(0, 19).replace("T", " ");

  // 2. Write audit record (BIGINT timestamps)
  await conn.execute(
    `INSERT INTO admin_pipeline_regenerations
       (claim_id, requested_by_user_id, requested_by_user_name, reason,
        previous_status, status, created_at, updated_at)
     VALUES (?, '0', 'system-script', ?, ?, 'pending', ?, ?)`,
    [claim.id, REASON, claim.status, nowMs, nowMs]
  );

  // 3. Reset claim to intake_pending (DATETIME timestamp)
  await conn.execute(
    `UPDATE claims SET
       status='intake_pending',
       document_processing_status='pending',
       ai_assessment_triggered=0,
       ai_assessment_started_at=NULL,
       ai_assessment_completed_at=NULL,
       updated_at=?
     WHERE id=?`,
    [nowDt, claim.id]
  );

  console.log(`✅ Claim ${CLAIM_REF} (id=${claim.id}) reset to intake_pending. Pipeline will trigger on next processing cycle.`);
} finally {
  await conn.end();
}
