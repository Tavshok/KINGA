import { createConnection } from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const url = new URL(DATABASE_URL);
  const conn = await createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false }
  });

  // Check users
  const [users] = await conn.query('SELECT id, name, role, insurer_role FROM users LIMIT 10');
  console.log('=== Users ===');
  console.table(users);

  // Check claims count
  const [claimsCount] = await conn.query('SELECT COUNT(*) as cnt FROM claims');
  console.log('=== Claims Count ===', claimsCount);

  // Check if workflow_state column exists
  const [cols] = await conn.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'claims' AND COLUMN_NAME = 'workflow_state'");
  console.log('=== workflow_state column ===', cols);

  // Test the KPI query
  try {
    const [result] = await conn.query('SELECT COUNT(*) as count FROM claims');
    console.log('=== Total Claims ===', result);
  } catch(e) {
    console.error('KPI query error:', e.message);
  }

  // Test the fraud detection query
  try {
    const [result] = await conn.query("SELECT COUNT(*) as count FROM ai_assessments WHERE fraud_risk_level = 'high'");
    console.log('=== Fraud High ===', result);
  } catch(e) {
    console.error('Fraud query error:', e.message);
  }

  // Test the avg processing time query
  try {
    const [result] = await conn.query("SELECT AVG(TIMESTAMPDIFF(DAY, created_at, closed_at)) as avgDays FROM claims WHERE status = 'completed' AND closed_at IS NOT NULL");
    console.log('=== Avg Processing ===', result);
  } catch(e) {
    console.error('Avg processing error:', e.message);
  }

  // Test the bottleneck query
  try {
    const [result] = await conn.query("SELECT workflow_state, COUNT(*) as cnt FROM claims WHERE status NOT IN ('completed', 'rejected') GROUP BY workflow_state");
    console.log('=== Bottlenecks ===', result);
  } catch(e) {
    console.error('Bottleneck query error:', e.message);
  }

  // Test the panel beater analytics query
  try {
    const [result] = await conn.query(`
      SELECT pb.id, pb.business_name, COUNT(pbq.id) as total_quotes
      FROM panel_beaters pb
      LEFT JOIN panel_beater_quotes pbq ON pb.id = pbq.panel_beater_id
      GROUP BY pb.id, pb.business_name
    `);
    console.log('=== Panel Beater Analytics ===', result);
  } catch(e) {
    console.error('Panel beater query error:', e.message);
  }

  await conn.end();
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
