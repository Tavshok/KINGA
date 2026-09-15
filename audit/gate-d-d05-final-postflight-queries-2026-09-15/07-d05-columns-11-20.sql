-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'automation_audit_log',
  'bias_detection_flags',
  'calibration_overrides',
  'claim_approvals',
  'claim_events',
  'claim_intake_requests',
  'claim_intelligence_dataset',
  'claim_involvement_tracking',
  'claim_review_queue',
  'commission_records'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
