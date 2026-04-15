/**
 * Migration: Add currency column to quote_line_items and quotes tables
 * Run with: node scripts/add-currency-columns.mjs
 */
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const u = new URL(url);
const conn = await mysql.createConnection({
  host: u.hostname,
  port: parseInt(u.port || '4000'),
  user: u.username,
  password: decodeURIComponent(u.password),
  database: u.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

async function addColumnIfMissing(table, column, definition) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length === 0) {
    console.log(`Adding ${column} to ${table}...`);
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  ✓ Added`);
  } else {
    console.log(`  ✓ ${table}.${column} already exists`);
  }
}

try {
  await addColumnIfMissing('quote_line_items', 'currency', "VARCHAR(10) NULL DEFAULT NULL AFTER `line_total`");
  await addColumnIfMissing('quotes', 'currency', "VARCHAR(10) NULL DEFAULT NULL AFTER `total_amount`");
  await addColumnIfMissing('cost_learning_records', 'currency', "VARCHAR(10) NULL DEFAULT NULL AFTER `total_repair_cost`");
  console.log('\nMigration complete.');
} catch (err) {
  console.error('Migration error:', err.message);
  process.exit(1);
} finally {
  await conn.end();
}
