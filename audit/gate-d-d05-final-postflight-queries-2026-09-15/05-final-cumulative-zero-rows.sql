-- Source-derived final cumulative 188-table zero-row assertion; read-only.
USE `kinga_staging`;
SELECT
  COUNT(*) AS checked_table_count,
  COALESCE(SUM(row_count), 0) AS total_rows,
  MIN(row_count) AS minimum_rows,
  MAX(row_count) AS maximum_rows
FROM (
SELECT 'access_denial_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`access_denial_log`
UNION ALL
SELECT 'adjuster_sign_offs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`adjuster_sign_offs`
UNION ALL
SELECT 'agency_assisted_claimant_identities' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_assisted_claimant_identities`
UNION ALL
SELECT 'agency_clients' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_clients`
UNION ALL
SELECT 'agency_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_documents`
UNION ALL
SELECT 'agency_insurance_service_request_insurers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_service_request_insurers`
UNION ALL
SELECT 'agency_insurance_service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_service_requests`
UNION ALL
SELECT 'agency_insurance_valuation_deviations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_valuation_deviations`
UNION ALL
SELECT 'agency_product_commission_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_product_commission_configs`
UNION ALL
SELECT 'ai_assessments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`ai_assessments`
UNION ALL
SELECT 'ai_prediction_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`ai_prediction_logs`
UNION ALL
SELECT 'anonymization_audit_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`anonymization_audit_log`
UNION ALL
SELECT 'appointments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`appointments`
UNION ALL
SELECT 'approval_workflow' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`approval_workflow`
UNION ALL
SELECT 'assessor_deviation_metrics' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_deviation_metrics`
UNION ALL
SELECT 'assessor_evaluations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_evaluations`
UNION ALL
SELECT 'assessor_insurer_relationships' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_insurer_relationships`
UNION ALL
SELECT 'assessor_report_attachments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_report_attachments`
UNION ALL
SELECT 'assessor_report_reviews' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_report_reviews`
UNION ALL
SELECT 'assessor_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_reports`
UNION ALL
SELECT 'assessor_subscriptions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_subscriptions`
UNION ALL
SELECT 'assessors' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessors`
UNION ALL
SELECT 'asset_registry' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`asset_registry`
UNION ALL
SELECT 'audit_trail' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`audit_trail`
UNION ALL
SELECT 'automation_audit_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`automation_audit_log`
UNION ALL
SELECT 'automation_policies' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`automation_policies`
UNION ALL
SELECT 'bias_detection_flags' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`bias_detection_flags`
UNION ALL
SELECT 'calibration_overrides' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`calibration_overrides`
UNION ALL
SELECT 'claim_approvals' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_approvals`
UNION ALL
SELECT 'claim_assignments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_assignments`
UNION ALL
SELECT 'claim_comment_reads' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_comment_reads`
UNION ALL
SELECT 'claim_comments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_comments`
UNION ALL
SELECT 'claim_confidence_scores' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_confidence_scores`
UNION ALL
SELECT 'claim_decision_lifecycle' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_decision_lifecycle`
UNION ALL
SELECT 'claim_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_documents`
UNION ALL
SELECT 'claim_events' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_events`
UNION ALL
SELECT 'claim_intake_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_intake_requests`
UNION ALL
SELECT 'claim_intelligence_dataset' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_intelligence_dataset`
UNION ALL
SELECT 'claim_involvement_tracking' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_involvement_tracking`
UNION ALL
SELECT 'claim_review_queue' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_review_queue`
UNION ALL
SELECT 'claim_routing_decisions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_routing_decisions`
UNION ALL
SELECT 'claims' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claims`
UNION ALL
SELECT 'client_insurance_service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_insurance_service_requests`
UNION ALL
SELECT 'client_vehicle_valuation_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_vehicle_valuation_requests`
UNION ALL
SELECT 'commission_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`commission_records`
UNION ALL
SELECT 'component_benchmarks' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`component_benchmarks`
UNION ALL
SELECT 'component_repair_outcomes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`component_repair_outcomes`
UNION ALL
SELECT 'cost_components' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`cost_components`
UNION ALL
SELECT 'cost_learning_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`cost_learning_records`
UNION ALL
SELECT 'country_repair_index' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`country_repair_index`
UNION ALL
SELECT 'cross_claim_signals' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`cross_claim_signals`
UNION ALL
SELECT 'currency_exchange_rates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`currency_exchange_rates`
UNION ALL
SELECT 'customer_consent' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`customer_consent`
UNION ALL
SELECT 'customer_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`customer_documents`
UNION ALL
SELECT 'dataset_access_grants' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`dataset_access_grants`
UNION ALL
SELECT 'decision_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`decision_snapshots`
UNION ALL
SELECT 'document_naming_templates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`document_naming_templates`
UNION ALL
SELECT 'driver_claims' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`driver_claims`
UNION ALL
SELECT 'drivers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`drivers`
UNION ALL
SELECT 'engineer_observations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`engineer_observations`
UNION ALL
SELECT 'engineer_profiles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`engineer_profiles`
UNION ALL
SELECT 'extracted_document_data' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`extracted_document_data`
UNION ALL
SELECT 'extracted_repair_items' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`extracted_repair_items`
UNION ALL
SELECT 'fast_track_config' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fast_track_config`
UNION ALL
SELECT 'fast_track_routing_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fast_track_routing_log`
UNION ALL
SELECT 'federated_learning_metadata' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`federated_learning_metadata`
UNION ALL
SELECT 'final_approval_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`final_approval_records`
UNION ALL
SELECT 'fleet_accounts' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_accounts`
UNION ALL
SELECT 'fleet_audit_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_audit_logs`
UNION ALL
SELECT 'fleet_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_documents`
UNION ALL
SELECT 'fleet_drivers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_drivers`
UNION ALL
SELECT 'fleet_incident_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_incident_reports`
UNION ALL
SELECT 'fleet_intelligence_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_intelligence_snapshots`
UNION ALL
SELECT 'fleet_manager_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_manager_requests`
UNION ALL
SELECT 'fleet_rfq_client_instructions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_rfq_client_instructions`
UNION ALL
SELECT 'fleet_risk_scores' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_risk_scores`
UNION ALL
SELECT 'fleet_vehicles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_vehicles`
UNION ALL
SELECT 'fleets' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleets`
UNION ALL
SELECT 'fraud_alerts' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fraud_alerts`
UNION ALL
SELECT 'fraud_indicators' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fraud_indicators`
UNION ALL
SELECT 'fraud_rules' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fraud_rules`
UNION ALL
SELECT 'fuel_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fuel_records`
UNION ALL
SELECT 'generated_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`generated_reports`
UNION ALL
SELECT 'global_anonymized_dataset' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`global_anonymized_dataset`
UNION ALL
SELECT 'global_search_analytics' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`global_search_analytics`
UNION ALL
SELECT 'global_search_history' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`global_search_history`
UNION ALL
SELECT 'governance_audit_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_audit_log`
UNION ALL
SELECT 'governance_notifications' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_notifications`
UNION ALL
SELECT 'governance_violation_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_violation_log`
UNION ALL
SELECT 'historical_claims' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`historical_claims`
UNION ALL
SELECT 'historical_replay_results' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`historical_replay_results`
UNION ALL
SELECT 'human_review_queue' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`human_review_queue`
UNION ALL
SELECT 'ingestion_batches' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`ingestion_batches`
UNION ALL
SELECT 'ingestion_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`ingestion_documents`
UNION ALL
SELECT 'inspection_projects' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`inspection_projects`
UNION ALL
SELECT 'inspections' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`inspections`
UNION ALL
SELECT 'insurance_audit_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurance_audit_logs`
UNION ALL
SELECT 'insurance_carriers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurance_carriers`
UNION ALL
SELECT 'insurance_policies' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurance_policies`
UNION ALL
SELECT 'insurance_products' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurance_products`
UNION ALL
SELECT 'insurance_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurance_quotes`
UNION ALL
SELECT 'insurer_marketplace_links' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurer_marketplace_links`
UNION ALL
SELECT 'insurer_marketplace_relationships' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurer_marketplace_relationships`
UNION ALL
SELECT 'insurer_quote_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurer_quote_requests`
UNION ALL
SELECT 'insurer_tenants' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`insurer_tenants`
UNION ALL
SELECT 'iso_audit_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`iso_audit_logs`
UNION ALL
SELECT 'licensing_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`licensing_records`
UNION ALL
SELECT 'maintenance_alerts' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`maintenance_alerts`
UNION ALL
SELECT 'maintenance_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`maintenance_records`
UNION ALL
SELECT 'maintenance_schedules' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`maintenance_schedules`
UNION ALL
SELECT 'marketplace_profiles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`marketplace_profiles`
UNION ALL
SELECT 'measurement_types' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`measurement_types`
UNION ALL
SELECT 'mismatch_annotations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`mismatch_annotations`
UNION ALL
SELECT 'model_training_queue' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`model_training_queue`
UNION ALL
SELECT 'multi_reference_truth' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`multi_reference_truth`
UNION ALL
SELECT 'narrative_versions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`narrative_versions`
UNION ALL
SELECT 'notification_events' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notification_events`
UNION ALL
SELECT 'notification_preferences' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notification_preferences`
UNION ALL
SELECT 'notifications' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notifications`
UNION ALL
SELECT 'panel_beater_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`panel_beater_quotes`
UNION ALL
SELECT 'panel_beaters' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`panel_beaters`
UNION ALL
SELECT 'parts_pricing_baseline' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`parts_pricing_baseline`
UNION ALL
SELECT 'pdf_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pdf_reports`
UNION ALL
SELECT 'personal_vehicles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`personal_vehicles`
UNION ALL
SELECT 'physical_measurements' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`physical_measurements`
UNION ALL
SELECT 'physics_validation_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`physics_validation_records`
UNION ALL
SELECT 'pipeline_jobs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pipeline_jobs`
UNION ALL
SELECT 'pipeline_runs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pipeline_runs`
UNION ALL
SELECT 'platform_governance_limits' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`platform_governance_limits`
UNION ALL
SELECT 'police_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`police_reports`
UNION ALL
SELECT 'policy_claim_links' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`policy_claim_links`
UNION ALL
SELECT 'policy_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`policy_documents`
UNION ALL
SELECT 'policy_endorsements' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`policy_endorsements`
UNION ALL
SELECT 'pre_accident_damage' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pre_accident_damage`
UNION ALL
SELECT 'predictive_risk_scores' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`predictive_risk_scores`
UNION ALL
SELECT 'quotation_request_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`quotation_request_documents`
UNION ALL
SELECT 'quotation_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`quotation_requests`
UNION ALL
SELECT 'quote_line_items' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`quote_line_items`
UNION ALL
SELECT 'quote_optimisation_results' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`quote_optimisation_results`
UNION ALL
SELECT 'rate_limit_tracking' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`rate_limit_tracking`
UNION ALL
SELECT 'recovery_cases' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`recovery_cases`
UNION ALL
SELECT 'recovery_correspondence_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`recovery_correspondence_log`
UNION ALL
SELECT 'repair_cost_intelligence' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`repair_cost_intelligence`
UNION ALL
SELECT 'repair_history' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`repair_history`
UNION ALL
SELECT 'replay_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`replay_logs`
UNION ALL
SELECT 'report_access_audit' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_access_audit`
UNION ALL
SELECT 'report_links' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_links`
UNION ALL
SELECT 'report_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_snapshots`
UNION ALL
SELECT 'risk_register' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`risk_register`
UNION ALL
SELECT 'role_assignment_audit' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`role_assignment_audit`
UNION ALL
SELECT 'routing_history' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`routing_history`
UNION ALL
SELECT 'routing_threshold_config' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`routing_threshold_config`
UNION ALL
SELECT 'service_providers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_providers`
UNION ALL
SELECT 'service_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_quotes`
UNION ALL
SELECT 'service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_requests`
UNION ALL
SELECT 'shadow_override_monitor' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`shadow_override_monitor`
UNION ALL
SELECT 'similar_claims_clusters' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`similar_claims_clusters`
UNION ALL
SELECT 'super_audit_sessions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`super_audit_sessions`
UNION ALL
SELECT 'supplier_performance_metrics' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`supplier_performance_metrics`
UNION ALL
SELECT 'supplier_quote_line_items' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`supplier_quote_line_items`
UNION ALL
SELECT 'supplier_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`supplier_quotes`
UNION ALL
SELECT 'system_errors' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`system_errors`
UNION ALL
SELECT 'tenant_invitations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_invitations`
UNION ALL
SELECT 'tenant_isolation_violations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_isolation_violations`
UNION ALL
SELECT 'tenant_role_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_role_configs`
UNION ALL
SELECT 'tenant_workflow_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_workflow_configs`
UNION ALL
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenants`
UNION ALL
SELECT 'third_party_vehicles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`third_party_vehicles`
UNION ALL
SELECT 'training_data_scores' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`training_data_scores`
UNION ALL
SELECT 'training_dataset' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`training_dataset`
UNION ALL
SELECT 'usage_events' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`usage_events`
UNION ALL
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`users`
UNION ALL
SELECT 'valuation_comparable_evidence' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`valuation_comparable_evidence`
UNION ALL
SELECT 'variance_datasets' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`variance_datasets`
UNION ALL
SELECT 'vehicle_condition_assessment' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_condition_assessment`
UNION ALL
SELECT 'vehicle_condition_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_condition_snapshots`
UNION ALL
SELECT 'vehicle_damage_history' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_damage_history`
UNION ALL
SELECT 'vehicle_geometry_measurements' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_geometry_measurements`
UNION ALL
SELECT 'vehicle_market_valuations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_market_valuations`
UNION ALL
SELECT 'vehicle_mileage_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_mileage_logs`
UNION ALL
SELECT 'vehicle_models' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_models`
UNION ALL
SELECT 'vehicle_passport_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_passport_snapshots`
UNION ALL
SELECT 'vehicle_registry' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`vehicle_registry`
UNION ALL
SELECT 'weight_adjustment_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`weight_adjustment_log`
UNION ALL
SELECT 'whatsapp_sessions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`whatsapp_sessions`
UNION ALL
SELECT 'workflow_audit_trail' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_audit_trail`
UNION ALL
SELECT 'workflow_configuration' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_configuration`
UNION ALL
SELECT 'workflow_templates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_templates`
) AS all_wave_counts;
