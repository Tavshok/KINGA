import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.log('No DATABASE_URL'); process.exit(1); }

const conn = await createConnection(url);

const tables = [
  'ai_assessments',
  'claims',
  'assessor_evaluations',
  'fraud_indicators',
  'historical_replay_results',
];

for (const tbl of tables) {
  try {
    const [rows] = await conn.execute(
      `SELECT fraud_risk_level, COUNT(*) as cnt FROM ${tbl} WHERE fraud_risk_level IS NOT NULL GROUP BY fraud_risk_level ORDER BY fraud_risk_level`
    );
    console.log(`\n=== ${tbl} ===`);
    for (const r of rows) {
      console.log(`  ${r.fraud_risk_level}: ${r.cnt}`);
    }
  } catch (e) {
    console.log(`\n=== ${tbl} === ERROR: ${e.message}`);
  }
}

// Also check decision_snapshots.fraud_level (varchar, not enum)
try {
  const [rows] = await conn.execute(
    `SELECT fraud_level, COUNT(*) as cnt FROM decision_snapshots WHERE fraud_level IS NOT NULL GROUP BY fraud_level ORDER BY fraud_level`
  );
  console.log('\n=== decision_snapshots.fraud_level ===');
  for (const r of rows) {
    console.log(`  ${r.fraud_level}: ${r.cnt}`);
  }
} catch (e) {
  console.log(`\n=== decision_snapshots === ERROR: ${e.message}`);
}

await conn.end();
