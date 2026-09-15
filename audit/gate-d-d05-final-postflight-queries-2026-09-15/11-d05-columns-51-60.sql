-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'pipeline_jobs',
  'pipeline_runs',
  'policy_claim_links',
  'policy_endorsements',
  'predictive_risk_scores',
  'quotation_requests',
  'replay_logs',
  'risk_register',
  'role_assignment_audit',
  'routing_history'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
