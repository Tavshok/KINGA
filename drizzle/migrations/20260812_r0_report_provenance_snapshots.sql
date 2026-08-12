CREATE TABLE IF NOT EXISTS report_provenance_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  report_key VARCHAR(100) NOT NULL,
  tenant_id VARCHAR(255) NOT NULL,
  claim_id INT NULL,
  generator_version VARCHAR(100) NOT NULL,
  input_hash VARCHAR(64) NOT NULL,
  input_snapshot JSON NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY report_provenance_snapshots_job_id_uq (job_id),
  KEY report_provenance_snapshots_tenant_claim_idx (tenant_id, claim_id),
  KEY report_provenance_snapshots_hash_idx (input_hash)
);
