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
  'claim_routing_decisions',
  'claims',
  'client_insurance_service_requests',
  'client_vehicle_valuation_requests',
  'commission_records',
  'component_benchmarks',
  'component_repair_outcomes',
  'cost_components',
  'cost_learning_records',
  'country_repair_index',
  'cross_claim_signals',
  'currency_exchange_rates',
  'customer_consent',
  'customer_documents',
  'dataset_access_grants',
  'decision_snapshots',
  'document_naming_templates',
  'driver_claims',
  'drivers',
  'engineer_observations',
  'engineer_profiles',
  'extracted_document_data',
  'extracted_repair_items',
  'fast_track_config',
  'fast_track_routing_log',
  'federated_learning_metadata',
  'final_approval_records',
  'fleet_accounts',
  'fleet_audit_logs',
  'fleet_documents',
  'fleet_drivers',
  'fleet_incident_reports',
  'fleet_intelligence_snapshots',
  'fleet_manager_requests',
  'fleet_rfq_client_instructions',
  'fleet_risk_scores',
  'fleet_vehicles',
  'fleets',
  'fraud_alerts',
  'fraud_indicators'
  )
  AND index_name <> 'PRIMARY'
ORDER BY table_name, index_name, seq_in_index;
