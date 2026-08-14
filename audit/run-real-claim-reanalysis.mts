import mysql from "mysql2/promise";
import { triggerAiAssessment } from "../server/db";

const claimId = 12909902;
const tenantId = "tenant-1771335377063";
const reason = "User-authorised validation of benchmark-validated L2 and generated CL/CI/FR reports";
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) throw new Error("DATABASE_URL is required for the authorised validation run.");

async function readState(label: string) {
  const conn = await mysql.createConnection(dbUrl!);
  try {
    const [rows] = await conn.execute(
      `SELECT c.id, c.claim_number, c.kinga_ref, c.tenant_id, c.status, c.workflow_state,
              c.ai_assessment_triggered, c.ai_assessment_completed,
              c.document_processing_status, c.ai_assessment_started_at, c.ai_assessment_completed_at,
              a.id AS assessment_id, a.version_number, a.is_reanalysis, a.cost_intelligence_json IS NOT NULL AS has_cost_intelligence
         FROM claims c
         LEFT JOIN ai_assessments a ON a.claim_id = c.id
        WHERE c.id=? AND c.tenant_id=?
        ORDER BY a.created_at DESC
        LIMIT 1`,
      [claimId, tenantId],
    );
    return { label, state: (rows as Record<string, unknown>[])[0] ?? null };
  } finally {
    await conn.end();
  }
}

const preState = await readState("pre-trigger");
if (!preState.state) throw new Error("Authorised claim was not found in the expected tenant.");

const startedAt = new Date().toISOString();
await triggerAiAssessment(claimId);
const postState = await readState("post-trigger");

console.log(JSON.stringify({
  claimId,
  tenantId,
  reason,
  startedAt,
  completedAt: new Date().toISOString(),
  preState,
  postState,
}, null, 2));

process.exit(0);
