-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'training_data_scores',
  'training_dataset',
  'usage_events',
  'variance_datasets',
  'weight_adjustment_log'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
