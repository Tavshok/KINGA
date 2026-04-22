-- ============================================================
-- KINGA Reporting Framework — Database Migration
-- ============================================================

-- Report definitions (catalogue of all available report types)
CREATE TABLE IF NOT EXISTS report_definitions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_key VARCHAR(100) NOT NULL UNIQUE,
  report_name VARCHAR(200) NOT NULL,
  category ENUM('operational','portfolio','intelligence','executive','governance') NOT NULL,
  description TEXT,
  required_roles JSON NOT NULL,
  sensitivity ENUM('low','medium','high','very_high') NOT NULL DEFAULT 'medium',
  scope ENUM('claim','insurer','global','entity') NOT NULL,
  output_formats JSON NOT NULL DEFAULT '["pdf"]',
  is_schedulable TINYINT(1) NOT NULL DEFAULT 0,
  pii_fields JSON,
  retention_days INT NOT NULL DEFAULT 90,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000)
);

-- Report jobs (async generation queue)
CREATE TABLE IF NOT EXISTS report_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL UNIQUE,
  report_key VARCHAR(100) NOT NULL,
  status ENUM('queued','running','completed','failed','expired') NOT NULL DEFAULT 'queued',
  requested_by_user_id INT NOT NULL,
  tenant_id VARCHAR(100),
  parameters JSON,
  output_format ENUM('pdf','excel','json') NOT NULL DEFAULT 'pdf',
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
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000)
);

-- Report schedules (recurring report delivery)
CREATE TABLE IF NOT EXISTS report_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id VARCHAR(36) NOT NULL UNIQUE,
  report_key VARCHAR(100) NOT NULL,
  schedule_name VARCHAR(200) NOT NULL,
  tenant_id VARCHAR(100),
  parameters JSON,
  output_format ENUM('pdf','excel') NOT NULL DEFAULT 'pdf',
  frequency ENUM('daily','weekly','monthly','quarterly') NOT NULL,
  day_of_week TINYINT,
  day_of_month TINYINT,
  hour_of_day TINYINT NOT NULL DEFAULT 6,
  delivery_emails JSON NOT NULL,
  delivery_subject VARCHAR(300),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_run_at BIGINT,
  last_run_status ENUM('success','failed'),
  next_run_at BIGINT,
  created_by INT NOT NULL,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000)
);

-- Report audit log (immutable — no updates or deletes)
CREATE TABLE IF NOT EXISTS report_audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action ENUM('requested','generated','downloaded','scheduled','deleted','sar_generated','admin_regen_triggered','admin_regen_promoted') NOT NULL,
  report_key VARCHAR(100),
  job_id VARCHAR(36),
  claim_id INT,
  tenant_id VARCHAR(100),
  performed_by_user_id INT NOT NULL,
  performed_by_user_name VARCHAR(200),
  ip_address VARCHAR(50),
  parameters JSON,
  notes TEXT,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000)
);

-- Admin regeneration requests
CREATE TABLE IF NOT EXISTS admin_regen_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(36) NOT NULL UNIQUE,
  claim_id INT NOT NULL,
  original_assessment_id INT,
  new_assessment_id INT,
  status ENUM('pending','running','completed','failed','promoted','rejected') NOT NULL DEFAULT 'pending',
  requested_by INT NOT NULL,
  approved_by INT,
  rejected_by INT,
  reason_code ENUM('document_upload_failed','lle_extraction_failed','pipeline_timeout','pipeline_incomplete','quality_improvement','legal_request','other') NOT NULL,
  reason_notes TEXT,
  claim_state_at_request VARCHAR(50),
  four_eyes_required TINYINT(1) NOT NULL DEFAULT 0,
  promoted_at BIGINT,
  rejected_at BIGINT,
  rejection_reason TEXT,
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP(NOW(3)) * 1000)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_jobs_status ON report_jobs(status);
CREATE INDEX IF NOT EXISTS idx_report_jobs_user ON report_jobs(requested_by_user_id);
CREATE INDEX IF NOT EXISTS idx_report_jobs_tenant ON report_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_jobs_key ON report_jobs(report_key);
CREATE INDEX IF NOT EXISTS idx_report_jobs_expires ON report_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant ON report_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next ON report_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_report_audit_user ON report_audit_log(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_claim ON report_audit_log(claim_id);
CREATE INDEX IF NOT EXISTS idx_report_audit_created ON report_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_regen_claim ON admin_regen_requests(claim_id);
CREATE INDEX IF NOT EXISTS idx_admin_regen_status ON admin_regen_requests(status);
