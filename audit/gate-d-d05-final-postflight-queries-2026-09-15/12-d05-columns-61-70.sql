-- Source-derived bounded D-05 column metadata; read-only.
SELECT
  TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'routing_threshold_config',
  'service_providers',
  'shadow_override_monitor',
  'similar_claims_clusters',
  'super_audit_sessions',
  'supplier_performance_metrics',
  'system_errors',
  'tenant_isolation_violations',
  'tenant_role_configs',
  'third_party_vehicles'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
