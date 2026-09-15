USE `kinga_staging`;

SELECT COUNT(*) AS checked_table_count,
       SUM(row_count) AS total_rows,
       MIN(row_count) AS minimum_rows,
       MAX(row_count) AS maximum_rows
FROM (
  SELECT 'agency_assisted_claimant_identities' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_assisted_claimant_identities`
  UNION ALL
  SELECT 'agency_clients' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_clients`
  UNION ALL
  SELECT 'agency_insurance_service_request_insurers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_service_request_insurers`
  UNION ALL
  SELECT 'agency_insurance_service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_service_requests`
  UNION ALL
  SELECT 'agency_insurance_valuation_deviations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_insurance_valuation_deviations`
  UNION ALL
  SELECT 'agency_product_commission_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`agency_product_commission_configs`
  UNION ALL
  SELECT 'approval_workflow' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`approval_workflow`
  UNION ALL
  SELECT 'claim_comment_reads' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_comment_reads`
  UNION ALL
  SELECT 'claim_comments' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`claim_comments`
  UNION ALL
  SELECT 'client_insurance_service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_insurance_service_requests`
  UNION ALL
  SELECT 'client_vehicle_valuation_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`client_vehicle_valuation_requests`
  UNION ALL
  SELECT 'engineer_observations' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`engineer_observations`
  UNION ALL
  SELECT 'engineer_profiles' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`engineer_profiles`
  UNION ALL
  SELECT 'fleet_accounts' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_accounts`
  UNION ALL
  SELECT 'fleet_audit_logs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_audit_logs`
  UNION ALL
  SELECT 'fleet_drivers' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`fleet_drivers`
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
  SELECT 'governance_audit_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_audit_log`
  UNION ALL
  SELECT 'governance_notifications' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_notifications`
  UNION ALL
  SELECT 'governance_violation_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`governance_violation_log`
  UNION ALL
  SELECT 'inspection_projects' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`inspection_projects`
  UNION ALL
  SELECT 'notification_events' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notification_events`
  UNION ALL
  SELECT 'notification_preferences' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notification_preferences`
  UNION ALL
  SELECT 'notifications' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`notifications`
  UNION ALL
  SELECT 'panel_beaters' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`panel_beaters`
  UNION ALL
  SELECT 'platform_governance_limits' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`platform_governance_limits`
  UNION ALL
  SELECT 'rate_limit_tracking' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`rate_limit_tracking`
  UNION ALL
  SELECT 'recovery_cases' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`recovery_cases`
  UNION ALL
  SELECT 'recovery_correspondence_log' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`recovery_correspondence_log`
  UNION ALL
  SELECT 'service_requests' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`service_requests`
  UNION ALL
  SELECT 'tenant_workflow_configs' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`tenant_workflow_configs`
  UNION ALL
  SELECT 'whatsapp_sessions' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`whatsapp_sessions`
  UNION ALL
  SELECT 'workflow_audit_trail' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_audit_trail`
  UNION ALL
  SELECT 'workflow_configuration' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_configuration`
  UNION ALL
  SELECT 'workflow_templates' AS table_name, COUNT(*) AS row_count FROM `kinga_staging`.`workflow_templates`
) AS per_table_counts;
