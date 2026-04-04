/**
 * Backfill documentedOriginalQuoteUsd, documentedAgreedCostUsd, and panelBeaterName
 * into costIntelligenceJson for assessments that were processed before the Stage 9 fix.
 * 
 * Strategy: read pipelineRunSummary → claimRecord.repairQuote to get the extracted quote data,
 * then merge it into costIntelligenceJson.
 */
import { createConnection } from 'mysql2/promise';

const connStr = process.env.DATABASE_URL;
if (!connStr) { console.error('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(connStr);

// Get all assessments where costIntelligenceJson exists but documentedOriginalQuoteUsd is missing
const [rows] = await conn.execute(`
  SELECT id, claim_id, cost_intelligence_json, pipeline_run_summary
  FROM ai_assessments
  WHERE cost_intelligence_json IS NOT NULL
  AND (
    cost_intelligence_json NOT LIKE '%documentedOriginalQuoteUsd%'
    OR cost_intelligence_json NOT LIKE '%panelBeaterName%'
  )
  ORDER BY id DESC
`);

console.log(`Found ${rows.length} assessments to backfill`);

let updated = 0;
let skipped = 0;

for (const row of rows) {
  let ci, ps;
  try { ci = JSON.parse(row.cost_intelligence_json); } catch { skipped++; continue; }
  try { ps = row.pipeline_run_summary ? JSON.parse(row.pipeline_run_summary) : null; } catch { ps = null; }

  // Try to get repairQuote from pipelineRunSummary
  const repairQuote = ps?.claimRecord?.repairQuote ?? ps?.repairQuote ?? null;
  
  if (!repairQuote) {
    console.log(`  Assessment ${row.id}: No repairQuote in pipelineRunSummary — skipping`);
    skipped++;
    continue;
  }

  const quoteTotalCents = repairQuote.quoteTotalCents ?? null;
  const agreedCostCents = repairQuote.agreedCostCents ?? null;
  const repairerName = repairQuote.repairerName ?? repairQuote.panelBeaterName ?? null;
  const labourCostCents = repairQuote.labourCostCents ?? null;
  const partsCostCents = repairQuote.partsCostCents ?? null;

  if (!quoteTotalCents && !agreedCostCents) {
    console.log(`  Assessment ${row.id}: repairQuote has no cost data — skipping`);
    skipped++;
    continue;
  }

  // Merge into costIntelligenceJson
  if (quoteTotalCents) ci.documentedOriginalQuoteUsd = quoteTotalCents / 100;
  if (agreedCostCents) ci.documentedAgreedCostUsd = agreedCostCents / 100;
  if (repairerName) ci.panelBeaterName = repairerName;
  if (labourCostCents) ci.documentedLabourCostUsd = labourCostCents / 100;
  if (partsCostCents) ci.documentedPartsCostUsd = partsCostCents / 100;

  await conn.execute(
    'UPDATE ai_assessments SET cost_intelligence_json = ? WHERE id = ?',
    [JSON.stringify(ci), row.id]
  );

  console.log(`  ✅ Assessment ${row.id} (claim ${row.claim_id}): documentedOriginalQuoteUsd=${ci.documentedOriginalQuoteUsd}, agreedCostUsd=${ci.documentedAgreedCostUsd}, panelBeater=${ci.panelBeaterName}`);
  updated++;
}

console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
await conn.end();
