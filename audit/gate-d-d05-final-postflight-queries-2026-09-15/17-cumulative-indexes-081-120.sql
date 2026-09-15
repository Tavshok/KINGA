-- Source-derived bounded cumulative non-primary index-column metadata; read-only.
SELECT
  table_name,
  index_name,
  seq_in_index,
  column_name,
  non_unique
FROM information_schema.statistics
WHERE table_schema = 'kinga_staging'
  AND table_name IN (
  'fraud_rules',
  'fuel_records',
  'generated_reports',
  'global_anonymized_dataset',
  'global_search_analytics',
  'global_search_history',
  'governance_audit_log',
  'governance_notifications',
  'governance_violation_log',
  'historical_claims',
  'historical_replay_results',
  'human_review_queue',
  'ingestion_batches',
  'ingestion_documents',
  'inspection_projects',
  'inspections',
  'insurance_audit_logs',
  'insurance_carriers',
  'insurance_policies',
  'insurance_products',
  'insurance_quotes',
  'insurer_marketplace_links',
  'insurer_marketplace_relationships',
  'insurer_quote_requests',
  'insurer_tenants',
  'iso_audit_logs',
  'licensing_records',
  'maintenance_alerts',
  'maintenance_records',
  'maintenance_schedules',
  'marketplace_profiles',
  'measurement_types',
  'mismatch_annotations',
  'model_training_queue',
  'multi_reference_truth',
  'narrative_versions',
  'notification_events',
  'notification_preferences',
  'notifications',
  'panel_beater_quotes'
  )
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
