/**
 * Migration: add extraction_retry_count and extraction_failed_at to claims table
 * Run with: node add-extraction-columns.mjs
 */
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';

// Load .env manually
try {
  const env = readFileSync('/home/ubuntu/kinga-replit/.env', 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
} catch {}

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(url);

const migrations = [
  `ALTER TABLE claims ADD COLUMN extraction_retry_count INT NOT NULL DEFAULT 0`,
  `ALTER TABLE claims ADD COLUMN extraction_failed_at TIMESTAMP NULL`,
];

for (const sql of migrations) {
  try {
    await conn.execute(sql);
    console.log('✓', sql.split(' ').slice(0, 6).join(' '));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠ Already exists:', sql.split(' ').slice(0, 6).join(' '));
    } else {
      console.error('✗', e.message);
    }
  }
}

await conn.end();
console.log('Done.');
