-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'access_denial_log',
  'anonymization_audit_log',
  'appointments',
  'assessor_deviation_metrics',
  'assessor_evaluations',
  'assessor_insurer_relationships',
  'assessor_subscriptions',
  'assessors',
  'asset_registry',
  'audit_trail'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
