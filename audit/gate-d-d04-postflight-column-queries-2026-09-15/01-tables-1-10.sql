SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, COLUMN_TYPE, EXTRA
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'kinga_staging'
  AND TABLE_NAME IN (
  'agency_assisted_claimant_identities',
  'agency_clients',
  'agency_insurance_service_request_insurers',
  'agency_insurance_service_requests',
  'agency_insurance_valuation_deviations',
  'agency_product_commission_configs',
  'approval_workflow',
  'claim_comment_reads',
  'claim_comments',
  'client_insurance_service_requests'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;
