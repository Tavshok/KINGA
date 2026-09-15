-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'global_anonymized_dataset',
  'global_search_analytics',
  'global_search_history',
  'historical_claims',
  'historical_replay_results',
  'human_review_queue',
  'ingestion_batches',
  'insurer_tenants',
  'iso_audit_logs',
  'licensing_records'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
