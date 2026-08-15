CREATE TABLE IF NOT EXISTS assessor_reports (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  assessor_user_id INT NOT NULL,
  assignment_id INT NOT NULL,
  parent_report_id INT NULL,
  version_number INT NOT NULL DEFAULT 1,
  creation_method ENUM('native_upload', 'kinga_assisted') NOT NULL,
  status ENUM('draft', 'attested', 'submitted', 'under_review', 'returned', 'rejected', 'accepted', 'superseded') NOT NULL DEFAULT 'draft',
  title VARCHAR(255) NOT NULL,
  source_file_name VARCHAR(500) NULL,
  source_storage_key VARCHAR(500) NULL,
  source_file_url TEXT NULL,
  source_mime_type VARCHAR(255) NULL,
  source_file_hash VARCHAR(128) NULL,
  report_payload JSON NULL,
  kinga_extraction_json JSON NULL,
  attested_by_user_id INT NULL,
  attested_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  superseded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessor_reports_claim FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_reports_assessor FOREIGN KEY (assessor_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_reports_assignment FOREIGN KEY (assignment_id) REFERENCES claim_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_reports_parent FOREIGN KEY (parent_report_id) REFERENCES assessor_reports(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_reports_attester FOREIGN KEY (attested_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_assessor_reports_claim_state (claim_id, status),
  INDEX idx_assessor_reports_assessor_state (assessor_user_id, status),
  INDEX idx_assessor_reports_tenant_state (tenant_id, status),
  UNIQUE KEY uq_assessor_reports_claim_version (claim_id, version_number)
);

CREATE TABLE IF NOT EXISTS assessor_report_attachments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(500) NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  file_url TEXT NOT NULL,
  mime_type VARCHAR(255) NULL,
  size_bytes INT NULL,
  file_hash VARCHAR(128) NULL,
  attachment_role ENUM('original_report', 'supporting_evidence', 'generated_export') NOT NULL DEFAULT 'supporting_evidence',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessor_report_attachments_report FOREIGN KEY (report_id) REFERENCES assessor_reports(id) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_assessor_report_attachments_report (report_id),
  INDEX idx_assessor_report_attachments_tenant (tenant_id)
);

CREATE TABLE IF NOT EXISTS assessor_report_reviews (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  report_id INT NOT NULL,
  claim_id INT NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  reviewer_user_id INT NOT NULL,
  reviewer_role ENUM('claims_assessor', 'claims_manager') NOT NULL,
  status ENUM('pending', 'accepted', 'returned', 'rejected', 'escalated') NOT NULL DEFAULT 'pending',
  route_reason ENUM('assigned_claims_assessor', 'claims_manager_fallback', 'claims_manager_escalation') NOT NULL,
  decision_reason TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessor_report_reviews_report FOREIGN KEY (report_id) REFERENCES assessor_reports(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_report_reviews_claim FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assessor_report_reviews_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX idx_assessor_report_reviews_reviewer_state (reviewer_user_id, status),
  INDEX idx_assessor_report_reviews_claim_state (claim_id, status),
  INDEX idx_assessor_report_reviews_tenant_state (tenant_id, status)
);

ALTER TABLE assessor_evaluations
  ADD COLUMN source_report_id INT NULL,
  ADD COLUMN source_report_version INT NULL,
  ADD COLUMN accepted_review_id INT NULL;

ALTER TABLE assessor_evaluations
  ADD CONSTRAINT fk_assessor_evaluations_source_report FOREIGN KEY (source_report_id) REFERENCES assessor_reports(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_assessor_evaluations_accepted_review FOREIGN KEY (accepted_review_id) REFERENCES assessor_report_reviews(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE assessor_evaluations
  ADD INDEX idx_assessor_evaluations_source_report (source_report_id);
