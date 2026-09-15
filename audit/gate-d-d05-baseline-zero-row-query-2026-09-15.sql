-- Generated from pinned D-01–D-04 sources; read-only count assertion.
SELECT
  COUNT(*) AS tables_checked,
  COALESCE(SUM(row_count), 0) AS total_rows,
  MIN(row_count) AS minimum_rows,
  MAX(row_count) AS maximum_rows
FROM (
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
SELECT 'approval_workflow' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`approval_workflow`
UNION ALL
SELECT 'assessor_report_attachments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_report_attachments`
UNION ALL
SELECT 'assessor_report_reviews' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_report_reviews`
UNION ALL
SELECT 'assessor_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`assessor_reports`
UNION ALL
SELECT 'automation_policies' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`automation_policies`
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
SELECT 'claim_routing_decisions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_routing_decisions`
UNION ALL
SELECT 'claims' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claims`
UNION ALL
SELECT 'client_insurance_service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_insurance_service_requests`
UNION ALL
SELECT 'client_vehicle_valuation_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_vehicle_valuation_requests`
UNION ALL
SELECT 'component_repair_outcomes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`component_repair_outcomes`
UNION ALL
SELECT 'cost_components' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`cost_components`
UNION ALL
SELECT 'cost_learning_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`cost_learning_records`
UNION ALL
SELECT 'country_repair_index' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`country_repair_index`
UNION ALL
SELECT 'currency_exchange_rates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`currency_exchange_rates`
UNION ALL
SELECT 'customer_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`customer_documents`
UNION ALL
SELECT 'decision_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`decision_snapshots`
UNION ALL
SELECT 'document_naming_templates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`document_naming_templates`
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
SELECT 'generated_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`generated_reports`
UNION ALL
SELECT 'governance_audit_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_audit_log`
UNION ALL
SELECT 'governance_notifications' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_notifications`
UNION ALL
SELECT 'governance_violation_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_violation_log`
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
SELECT 'marketplace_profiles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`marketplace_profiles`
UNION ALL
SELECT 'measurement_types' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`measurement_types`
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
SELECT 'pdf_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pdf_reports`
UNION ALL
SELECT 'physics_validation_records' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`physics_validation_records`
UNION ALL
SELECT 'platform_governance_limits' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`platform_governance_limits`
UNION ALL
SELECT 'police_reports' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`police_reports`
UNION ALL
SELECT 'policy_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`policy_documents`
UNION ALL
SELECT 'pre_accident_damage' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`pre_accident_damage`
UNION ALL
SELECT 'quotation_request_documents' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`quotation_request_documents`
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
SELECT 'report_access_audit' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_access_audit`
UNION ALL
SELECT 'report_links' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_links`
UNION ALL
SELECT 'report_snapshots' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`report_snapshots`
UNION ALL
SELECT 'service_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_quotes`
UNION ALL
SELECT 'service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_requests`
UNION ALL
SELECT 'supplier_quote_line_items' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`supplier_quote_line_items`
UNION ALL
SELECT 'supplier_quotes' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`supplier_quotes`
UNION ALL
SELECT 'tenant_invitations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_invitations`
UNION ALL
SELECT 'tenant_workflow_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_workflow_configs`
UNION ALL
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenants`
UNION ALL
SELECT 'users' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`users`
UNION ALL
SELECT 'valuation_comparable_evidence' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`valuation_comparable_evidence`
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
SELECT 'whatsapp_sessions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`whatsapp_sessions`
UNION ALL
SELECT 'workflow_audit_trail' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_audit_trail`
UNION ALL
SELECT 'workflow_configuration' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_configuration`
UNION ALL
SELECT 'workflow_templates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_templates`
) AS baseline_counts;
