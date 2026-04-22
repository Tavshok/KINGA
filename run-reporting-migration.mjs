import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS report_definitions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_key VARCHAR(100) NOT NULL UNIQUE,
    report_name VARCHAR(200) NOT NULL,
    category VARCHAR(30) NOT NULL,
    description TEXT,
    required_roles JSON NOT NULL,
    sensitivity VARCHAR(20) NOT NULL DEFAULT 'medium',
    scope VARCHAR(20) NOT NULL,
    output_formats JSON NOT NULL,
    is_schedulable TINYINT(1) NOT NULL DEFAULT 0,
    pii_fields JSON,
    retention_days INT NOT NULL DEFAULT 90,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS report_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL UNIQUE,
    report_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    requested_by_user_id INT NOT NULL,
    tenant_id VARCHAR(100),
    parameters JSON,
    output_format VARCHAR(10) NOT NULL DEFAULT 'pdf',
    s3_key VARCHAR(500),
    download_url VARCHAR(1000),
    download_url_expires_at BIGINT,
    download_count INT NOT NULL DEFAULT 0,
    last_downloaded_at BIGINT,
    last_downloaded_by INT,
    error_message TEXT,
    started_at BIGINT,
    completed_at BIGINT,
    expires_at BIGINT,
    file_size_bytes INT,
    page_count INT,
    row_count INT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS report_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id VARCHAR(36) NOT NULL UNIQUE,
    report_key VARCHAR(100) NOT NULL,
    schedule_name VARCHAR(200) NOT NULL,
    tenant_id VARCHAR(100),
    parameters JSON,
    output_format VARCHAR(10) NOT NULL DEFAULT 'pdf',
    frequency VARCHAR(20) NOT NULL,
    day_of_week TINYINT,
    day_of_month TINYINT,
    hour_of_day TINYINT NOT NULL DEFAULT 6,
    delivery_emails JSON NOT NULL,
    delivery_subject VARCHAR(300),
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_run_at BIGINT,
    last_run_status VARCHAR(10),
    next_run_at BIGINT,
    created_by INT NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS report_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(40) NOT NULL,
    report_key VARCHAR(100),
    job_id VARCHAR(36),
    claim_id INT,
    tenant_id VARCHAR(100),
    performed_by_user_id INT NOT NULL,
    performed_by_user_name VARCHAR(200),
    ip_address VARCHAR(50),
    parameters JSON,
    notes TEXT,
    created_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS admin_regen_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL UNIQUE,
    claim_id INT NOT NULL,
    original_assessment_id INT,
    new_assessment_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_by INT NOT NULL,
    approved_by INT,
    rejected_by INT,
    reason_code VARCHAR(50) NOT NULL,
    reason_notes TEXT,
    claim_state_at_request VARCHAR(50),
    four_eyes_required TINYINT(1) NOT NULL DEFAULT 0,
    promoted_at BIGINT,
    rejected_at BIGINT,
    rejection_reason TEXT,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON report_jobs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_report_jobs_user ON report_jobs(requested_by_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_jobs_tenant ON report_jobs(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_jobs_key ON report_jobs(report_key)`,
  `CREATE INDEX IF NOT EXISTS idx_report_jobs_expires ON report_jobs(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON report_schedules(tenant_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_schedules_next ON report_schedules(next_run_at)`,
  `CREATE INDEX IF NOT EXISTS idx_report_audit_user ON report_audit_log(performed_by_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_audit_claim ON report_audit_log(claim_id)`,
  `CREATE INDEX IF NOT EXISTS idx_report_audit_created ON report_audit_log(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_regen_claim ON admin_regen_requests(claim_id)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_regen_status ON admin_regen_requests(status)`,
];

let ok = 0, skip = 0, fail = 0;
for (const sql of statements) {
  try {
    await conn.execute(sql);
    const match = sql.match(/(?:TABLE|INDEX)\s+IF NOT EXISTS\s+(\w+)/i);
    console.log(`  ✓ ${match?.[1] ?? sql.substring(7,50)}`);
    ok++;
  } catch (e) {
    const msg = e.message ?? '';
    if (msg.includes('Duplicate key name') || msg.includes('already exists')) {
      skip++;
    } else {
      console.error(`  ✗ ${msg.substring(0,100)}`);
      fail++;
    }
  }
}
await conn.end();
console.log(`\nReporting migration: ${ok} created, ${skip} skipped, ${fail} failed`);
