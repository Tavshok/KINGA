import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Count tables
const [rows] = await conn.execute('SHOW TABLES');
const tables = rows.map(r => Object.values(r)[0]);
console.log('Total tables in DB:', tables.length);

// Check key tables
const keyTables = [
  'claims','users','notifications','repair_history','panel_beaters',
  'assessors','inspections','quotation_requests','panel_beater_quotes',
  'audit_trail','audit_logs','workflow_states','ai_assessments',
  'fraud_indicators','insurer_tenants','tenants','vehicle_registry'
];
const missing = keyTables.filter(t => !tables.includes(t));
console.log('Missing key tables:', missing.length === 0 ? 'NONE' : missing.join(', '));

// Check rejection audit columns
const [rejCols] = await conn.execute("SHOW COLUMNS FROM claims LIKE 'rejection%'");
console.log('Rejection audit columns:', rejCols.map(c => c.Field).join(', ') || 'NONE');

// Check rejected_by and rejected_at
const [rejExtra] = await conn.execute("SHOW COLUMNS FROM claims LIKE 'rejected%'");
console.log('Rejected_by/at columns:', rejExtra.map(c => c.Field).join(', ') || 'NONE');

// Check claim count
const [[{cnt}]] = await conn.execute('SELECT COUNT(*) as cnt FROM claims');
console.log('Total claims in DB:', cnt);

// Check user count
const [[{ucnt}]] = await conn.execute('SELECT COUNT(*) as cnt FROM users');
console.log('Total users in DB:', ucnt);

// Check notifications table
const [[{ncnt}]] = await conn.execute('SELECT COUNT(*) as cnt FROM notifications');
console.log('Total notifications in DB:', ncnt);

await conn.end();
console.log('DB validation complete.');
