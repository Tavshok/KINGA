SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'platform_governance_limits',
  'rate_limit_tracking',
  'recovery_cases',
  'recovery_correspondence_log',
  'service_requests',
  'tenant_workflow_configs',
  'whatsapp_sessions',
  'workflow_audit_trail',
  'workflow_configuration',
  'workflow_templates'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
