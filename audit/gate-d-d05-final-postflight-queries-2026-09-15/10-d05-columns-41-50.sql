-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'maintenance_alerts',
  'maintenance_records',
  'maintenance_schedules',
  'mismatch_annotations',
  'model_training_queue',
  'multi_reference_truth',
  'narrative_versions',
  'parts_pricing_baseline',
  'personal_vehicles',
  'physical_measurements'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
