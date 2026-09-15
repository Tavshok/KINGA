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
  'supplier_quotes',
  'system_errors',
  'tenant_invitations',
  'tenant_isolation_violations',
  'tenant_role_configs',
  'tenant_workflow_configs',
  'tenants',
  'third_party_vehicles',
  'training_data_scores',
  'training_dataset',
  'usage_events',
  'users',
  'valuation_comparable_evidence',
  'variance_datasets',
  'vehicle_condition_assessment',
  'vehicle_condition_snapshots',
  'vehicle_damage_history',
  'vehicle_geometry_measurements',
  'vehicle_market_valuations',
  'vehicle_mileage_logs',
  'vehicle_models',
  'vehicle_passport_snapshots',
  'vehicle_registry',
  'weight_adjustment_log',
  'whatsapp_sessions',
  'workflow_audit_trail',
  'workflow_configuration',
  'workflow_templates'
  )
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
