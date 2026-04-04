/**
 * One-time migration: add fraudScore and recommendation columns to ai_assessments.
 * Also backfills existing rows from their JSON fields.
 * Run: node migrate-add-columns.mjs
 */
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(url);

console.log('Connected to database');

// Add columns if they don't exist
const alterStatements = [
  `ALTER TABLE ai_assessments ADD COLUMN IF NOT EXISTS fraud_score INT NULL COMMENT 'Numeric fraud score 0-100, derived from fraud_score_breakdown_json.overallScore'`,
  `ALTER TABLE ai_assessments ADD COLUMN IF NOT EXISTS recommendation VARCHAR(50) NULL COMMENT 'Final pipeline recommendation: APPROVE|REVIEW|REJECT|ESCALATE|NEGOTIATE|PROCEED_TO_ASSESSMENT'`,
];

for (const sql of alterStatements) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.slice(0, 80));
  } catch (err) {
    // Column may already exist (different MySQL versions handle IF NOT EXISTS differently)
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column already exists, skipping');
    } else {
      throw err;
    }
  }
}

// Backfill existing rows: extract fraudScore from fraudScoreBreakdownJson
console.log('Backfilling fraud_score from fraud_score_breakdown_json...');
const [rows] = await conn.execute(
  `SELECT id, fraud_score_breakdown_json, cost_intelligence_json FROM ai_assessments WHERE fraud_score IS NULL OR recommendation IS NULL`
);

let updated = 0;
for (const row of rows) {
  let fraudScore = null;
  let recommendation = null;

  // Extract fraud score
  if (row.fraud_score_breakdown_json) {
    try {
      const breakdown = JSON.parse(row.fraud_score_breakdown_json);
      fraudScore = breakdown.overallScore ?? breakdown.overall_score ?? null;
      if (fraudScore !== null) fraudScore = Math.round(Number(fraudScore));
    } catch { /* ignore */ }
  }

  // Extract recommendation from costIntelligenceJson.costDecision.recommendation
  if (row.cost_intelligence_json) {
    try {
      const costIntel = JSON.parse(row.cost_intelligence_json);
      recommendation = costIntel?.costDecision?.recommendation ?? null;
    } catch { /* ignore */ }
  }

  if (fraudScore !== null || recommendation !== null) {
    const setParts = [];
    const values = [];
    if (fraudScore !== null) { setParts.push('fraud_score = ?'); values.push(fraudScore); }
    if (recommendation !== null) { setParts.push('recommendation = ?'); values.push(recommendation); }
    values.push(row.id);
    await conn.execute(`UPDATE ai_assessments SET ${setParts.join(', ')} WHERE id = ?`, values);
    updated++;
  }
}

console.log(`Backfilled ${updated} rows`);
await conn.end();
console.log('Migration complete');
