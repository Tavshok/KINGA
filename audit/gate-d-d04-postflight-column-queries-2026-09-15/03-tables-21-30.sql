SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'fleet_vehicles',
  'fleets',
  'governance_audit_log',
  'governance_notifications',
  'governance_violation_log',
  'inspection_projects',
  'notification_events',
  'notification_preferences',
  'notifications',
  'panel_beaters'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
