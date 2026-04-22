/**
 * test-pipeline-timing.mjs
 * Runs the full pipeline on claim 4560003 and reports per-stage timing.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const mysql = require("mysql2/promise");

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  // Get claim data
  const [claims] = await conn.execute("SELECT * FROM claims WHERE id = 4560003");
  const claim = claims[0];
  if (!claim) { console.error("Claim 4560003 not found"); process.exit(1); }

  const [docs] = await conn.execute("SELECT * FROM ingestion_documents WHERE claim_id = 4560003 LIMIT 1");
  const doc = docs[0];
  const pdfUrl = doc?.s3_url || doc?.source_url || null;

  const [photos] = await conn.execute("SELECT url FROM claim_evidence WHERE claim_id = 4560003 AND type='damage_photo' LIMIT 20");
  const damagePhotoUrls = photos.map(p => p.url);

  console.log(`Claim: ${claim.reference_number}`);
  console.log(`PDF: ${pdfUrl ? pdfUrl.substring(0, 80) + "..." : "none"}`);
  console.log(`Photos: ${damagePhotoUrls.length}`);
  console.log("");

  await conn.end();

  // Dynamically import the pipeline
  const { runPipelineV2 } = await import("./server/pipeline-v2/orchestrator.ts");

  const pipelineStart = Date.now();
  const stageTimes = {};
  
  // Wrap with a logging context
  const ctx = {
    claimId: 4560003,
    tenantId: claim.tenant_id || 1,
    pdfUrl,
    damagePhotoUrls,
    _stageStart: {},
    log: (stage, msg) => {
      const now = Date.now();
      if (!ctx._stageStart[stage]) ctx._stageStart[stage] = now;
      const elapsed = ((now - pipelineStart) / 1000).toFixed(1);
      console.log(`[${elapsed}s] [${stage}] ${msg.substring(0, 120)}`);
    }
  };

  try {
    const result = await runPipelineV2(ctx);
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.log(`\n=== PIPELINE COMPLETE in ${totalTime}s ===`);
    if (result?.stageTimings) {
      console.log("\nPer-stage timings:");
      for (const [stage, ms] of Object.entries(result.stageTimings)) {
        console.log(`  ${stage}: ${(ms / 1000).toFixed(1)}s`);
      }
    }
  } catch (err) {
    const totalTime = ((Date.now() - pipelineStart) / 1000).toFixed(1);
    console.error(`\n=== PIPELINE FAILED after ${totalTime}s: ${err.message} ===`);
    console.error(err.stack);
  }
}

main().catch(console.error);
