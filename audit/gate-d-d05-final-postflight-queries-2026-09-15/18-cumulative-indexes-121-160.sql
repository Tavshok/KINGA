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
  'panel_beaters',
  'parts_pricing_baseline',
  'pdf_reports',
  'personal_vehicles',
  'physical_measurements',
  'physics_validation_records',
  'pipeline_jobs',
  'pipeline_runs',
  'platform_governance_limits',
  'police_reports',
  'policy_claim_links',
  'policy_documents',
  'policy_endorsements',
  'pre_accident_damage',
  'predictive_risk_scores',
  'quotation_request_documents',
  'quotation_requests',
  'quote_line_items',
  'quote_optimisation_results',
  'rate_limit_tracking',
  'recovery_cases',
  'recovery_correspondence_log',
  'repair_cost_intelligence',
  'repair_history',
  'replay_logs',
  'report_access_audit',
  'report_links',
  'report_snapshots',
  'risk_register',
  'role_assignment_audit',
  'routing_history',
  'routing_threshold_config',
  'service_providers',
  'service_quotes',
  'service_requests',
  'shadow_override_monitor',
  'similar_claims_clusters',
  'super_audit_sessions',
  'supplier_performance_metrics',
  'supplier_quote_line_items'
  )
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
