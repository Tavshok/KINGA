-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'component_benchmarks',
  'cross_claim_signals',
  'customer_consent',
  'dataset_access_grants',
  'driver_claims',
  'fast_track_config',
  'fast_track_routing_log',
  'federated_learning_metadata',
  'final_approval_records',
  'fuel_records'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
