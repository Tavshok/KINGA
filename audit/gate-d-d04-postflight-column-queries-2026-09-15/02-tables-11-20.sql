SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'client_vehicle_valuation_requests',
  'engineer_observations',
  'engineer_profiles',
  'fleet_accounts',
  'fleet_audit_logs',
  'fleet_drivers',
  'fleet_intelligence_snapshots',
  'fleet_manager_requests',
  'fleet_rfq_client_instructions',
  'fleet_risk_scores'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
