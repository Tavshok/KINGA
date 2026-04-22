import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

const tables = [
  `CREATE TABLE IF NOT EXISTS admin_pipeline_regenerations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    claim_id INT NOT NULL,
    requested_by_user_id VARCHAR(255) NOT NULL,
    requested_by_user_name VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    previous_status VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX idx_regen_claim (claim_id),
    INDEX idx_regen_user (requested_by_user_id),
    INDEX idx_regen_status (status),
    INDEX idx_regen_created (created_at)
  )`,
  `CREATE TABLE IF NOT EXISTS report_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    job_id VARCHAR(255),
    tenant_id VARCHAR(255),
    performed_by_user_id VARCHAR(255) NOT NULL,
    performed_by_user_name VARCHAR(255) NOT NULL,
    parameters JSON,
    created_at BIGINT NOT NULL,
    INDEX idx_audit_action (action),
    INDEX idx_audit_user (performed_by_user_id),
    INDEX idx_audit_created (created_at)
  )`,
];

for (const sql of tables) {
  const name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "unknown";
  try {
    await conn.execute(sql);
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
  }
}

await conn.end();
console.log("Migration complete.");
