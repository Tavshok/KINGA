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
  'access_denial_log',
  'adjuster_sign_offs',
  'agency_assisted_claimant_identities',
  'agency_clients',
  'agency_documents',
  'agency_insurance_service_request_insurers',
  'agency_insurance_service_requests',
  'agency_insurance_valuation_deviations',
  'agency_product_commission_configs',
  'ai_assessments',
  'ai_prediction_logs',
  'anonymization_audit_log',
  'appointments',
  'approval_workflow',
  'assessor_deviation_metrics',
  'assessor_evaluations',
  'assessor_insurer_relationships',
  'assessor_report_attachments',
  'assessor_report_reviews',
  'assessor_reports',
  'assessor_subscriptions',
  'assessors',
  'asset_registry',
  'audit_trail',
  'automation_audit_log',
  'automation_policies',
  'bias_detection_flags',
  'calibration_overrides',
  'claim_approvals',
  'claim_assignments',
  'claim_comment_reads',
  'claim_comments',
  'claim_confidence_scores',
  'claim_decision_lifecycle',
  'claim_documents',
  'claim_events',
  'claim_intake_requests',
  'claim_intelligence_dataset',
  'claim_involvement_tracking',
  'claim_review_queue'
  )
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
