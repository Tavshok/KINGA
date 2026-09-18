CREATE DATABASE `kinga_ci_test`;
USE `kinga_ci_test`;
/*M!999999\- enable the sandbox mode */ 

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `__drizzle_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `__drizzle_migrations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `hash` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1556872;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `access_denial_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `access_denial_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `attempted_route` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurer_role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `denial_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=900001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `accident_clusters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `accident_clusters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cluster_label` int NOT NULL,
  `centroid_lat` decimal(10,7) DEFAULT NULL,
  `centroid_lng` decimal(10,7) DEFAULT NULL,
  `radius_meters` int DEFAULT NULL,
  `claim_count` int DEFAULT '0',
  `claim_ids_json` json DEFAULT NULL,
  `first_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_rate` decimal(5,2) DEFAULT NULL,
  `flagged_claim_count` int DEFAULT '0',
  `dominant_entities` json DEFAULT NULL,
  `risk_classification` enum('legitimate_hotspot','suspicious_cluster','staged_ring_alert','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `is_spatio_temporal` tinyint DEFAULT '0',
  `temporal_window_days` int DEFAULT NULL,
  `shared_entity_count` int DEFAULT '0',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `computed_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ac_risk_classification` (`risk_classification`),
  KEY `idx_ac_fraud_rate` (`fraud_rate`),
  KEY `idx_ac_claim_count` (`claim_count`),
  KEY `idx_ac_tenant` (`tenant_id`),
  KEY `idx_ac_computed_at` (`computed_at`),
  KEY `idx_accident_clusters_tenant` (`tenant_id`),
  KEY `idx_accident_clusters_fraud` (`fraud_rate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `adjuster_sign_offs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `adjuster_sign_offs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `adjuster_user_id` int DEFAULT NULL,
  `adjuster_name` varchar(255) NOT NULL,
  `decision` enum('APPROVE','REJECT','ESCALATE','DEFER') NOT NULL,
  `notes` text DEFAULT NULL,
  `ai_decision` varchar(50) DEFAULT NULL,
  `signed_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_aso_claim_id` (`claim_id`),
  KEY `idx_aso_adjuster_user_id` (`adjuster_user_id`),
  CONSTRAINT `restore_fk_adjuster_sign_offs_fk_adjuster_sign_offs_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `adjuster_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `adjuster_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessment_id` int DEFAULT NULL,
  `task_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('documentation','investigation','validation','escalation','communication') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'documentation',
  `priority` enum('critical','high','medium','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved` tinyint NOT NULL DEFAULT '0',
  `resolved_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_by_user_id` int DEFAULT NULL,
  `resolved_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_adj_tasks_claim` (`claim_id`),
  KEY `idx_adj_tasks_assessment` (`assessment_id`),
  KEY `idx_adj_tasks_resolved` (`resolved`),
  CONSTRAINT `restore_fk_adjuster_tasks_fk_adjuster_tasks_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `admin_pipeline_regenerations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_pipeline_regenerations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `requested_by_user_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested_by_user_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_regen_claim` (`claim_id`),
  KEY `idx_regen_user` (`requested_by_user_id`),
  KEY `idx_regen_status` (`status`),
  KEY `idx_regen_created` (`created_at`),
  CONSTRAINT `restore_fk_admin_pipeline_regenerations_fk_admin_pipeline_re` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `admin_regen_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_regen_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `original_assessment_id` int DEFAULT NULL,
  `new_assessment_id` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `requested_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `rejected_by` int DEFAULT NULL,
  `reason_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_state_at_request` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `four_eyes_required` tinyint(1) NOT NULL DEFAULT '0',
  `promoted_at` bigint DEFAULT NULL,
  `rejected_at` bigint DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` bigint NOT NULL DEFAULT '0',
  `updated_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `request_id` (`request_id`),
  KEY `idx_admin_regen_claim` (`claim_id`),
  KEY `idx_admin_regen_status` (`status`),
  CONSTRAINT `restore_fk_admin_regen_requests_fk_admin_regen_requests_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_assisted_claimant_identities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_assisted_claimant_identities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agency_client_id` int NOT NULL,
  `insurer_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `restricted_claimant_user_id` int NOT NULL,
  `verified_claimant_user_id` int DEFAULT NULL,
  `status` enum('restricted','linked_to_verified_claimant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'restricted',
  `created_by` int NOT NULL,
  `linked_by` int DEFAULT NULL,
  `linked_at` timestamp NULL DEFAULT NULL,
  `link_confirmation_statement` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_agency_assisted_claimant_identity` (`agency_tenant_id`,`agency_client_id`,`insurer_tenant_id`),
  KEY `idx_agency_assisted_claimant_insurer` (`insurer_tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_clients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_clients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_registration` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` year(4) DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_agency_clients_tenant` (`agency_tenant_id`),
  KEY `idx_agency_clients_id_number` (`id_number`),
  KEY `idx_agency_clients_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=330001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quotation_request_id` int DEFAULT NULL,
  `policy_id` int DEFAULT NULL,
  `document_type` enum('id_document','drivers_license','vehicle_registration','proof_of_address','bank_statement','vehicle_photos','previous_policy','claims_history','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_insurance_service_request_insurers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_insurance_service_request_insurers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `service_request_id` int NOT NULL,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `insurer_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('invited','viewed','responded','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invited',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_agency_service_request_insurer` (`service_request_id`,`insurer_tenant_id`),
  KEY `idx_agency_service_request_insurer_tenant` (`insurer_tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=690001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_insurance_service_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_insurance_service_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agency_client_id` int NOT NULL,
  `vehicle_registry_id` int DEFAULT NULL,
  `cover_type` enum('comprehensive','third_party','third_party_fire_theft','commercial','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','awaiting_client_acknowledgement','ready_for_insurer_review','under_insurer_review','closed','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `client_instruction` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_risk_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_mileage_km` int DEFAULT NULL,
  `client_proposed_value_cents` int DEFAULT NULL,
  `kinga_market_valuation_cents` int DEFAULT NULL,
  `valuation_date` timestamp NULL DEFAULT NULL,
  `valuation_provenance_json` json DEFAULT NULL,
  `variance_percent` decimal(7,2) DEFAULT NULL,
  `client_acknowledgement_json` json DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_agency_insurance_service_request_number` (`request_number`),
  KEY `idx_agency_insurance_service_request_tenant_status` (`agency_tenant_id`,`status`),
  KEY `idx_agency_insurance_service_request_client` (`agency_client_id`),
  KEY `idx_agency_insurance_service_request_vehicle` (`vehicle_registry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=690001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_insurance_valuation_deviations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_insurance_valuation_deviations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `service_request_id` int NOT NULL,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_proposed_value_cents` int NOT NULL,
  `kinga_market_valuation_cents` int NOT NULL,
  `variance_percent` decimal(7,2) NOT NULL,
  `acknowledgement_json` json NOT NULL,
  `recorded_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_agency_insurance_valuation_deviation_request` (`service_request_id`),
  KEY `idx_agency_insurance_valuation_deviation_tenant` (`agency_tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agency_product_commission_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `agency_product_commission_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `configured_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_agency_product_commission` (`agency_tenant_id`,`product_id`),
  KEY `idx_agency_product_commission_tenant` (`agency_tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ai_assessments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_assessments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `estimated_cost` int DEFAULT NULL,
  `damage_description` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detected_damage_types` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence_score` int DEFAULT NULL,
  `fraud_indicators` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_risk_level` enum('low','medium','moderate','high','critical','elevated') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_score_breakdown_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processing_time` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `total_loss_indicated` tinyint DEFAULT '0',
  `structural_damage_severity` enum('none','minor','moderate','severe','catastrophic') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `estimated_vehicle_value` int DEFAULT NULL,
  `repair_to_value_ratio` int DEFAULT NULL,
  `total_loss_reasoning` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damaged_components_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `physics_analysis` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `graph_urls` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_reanalysis` tinyint NOT NULL DEFAULT '0',
  `triggered_by` int DEFAULT NULL,
  `triggered_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_assessment_id` int DEFAULT NULL,
  `reanalysis_reason` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `version_number` int NOT NULL DEFAULT '1',
  `physics_deviation_score` int DEFAULT NULL,
  `forensic_analysis` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parts_cost` int DEFAULT NULL,
  `labor_cost` int DEFAULT NULL,
  `accident_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `structural_damage` tinyint DEFAULT '0',
  `airbag_deployment` tinyint DEFAULT '0',
  `estimated_parts_cost` int DEFAULT NULL,
  `estimated_labor_cost` int DEFAULT NULL,
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `inferred_hidden_damages_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `repair_intelligence_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parts_reconciliation_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_intelligence_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_photos_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence_score_breakdown_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pipeline_run_summary` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enriched_photos_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_inconsistencies_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consistency_check_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coherence_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_realism_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `causal_chain_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_bundle_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `realism_bundle_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `benchmark_bundle_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consensus_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `causal_verdict_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `constraint_overrides_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `validated_outcome_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `case_signature_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision_authority_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contradiction_gate_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_readiness_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `explanation_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `escalation_route_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision_trace_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stage2_raw_ocr_text` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_score` int DEFAULT NULL COMMENT 'Numeric fraud score 0-100, derived from fraud_score_breakdown_json.overallScore',
  `recommendation` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Final pipeline recommendation: APPROVE|REVIEW|REJECT|ESCALATE|NEGOTIATE|PROCEED_TO_ASSESSMENT',
  `claim_record_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accuracy_report_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `narrative_analysis_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_analysis_total_count` int DEFAULT '0',
  `image_analysis_success_count` int DEFAULT '0',
  `image_analysis_failed_count` int DEFAULT '0',
  `image_analysis_success_rate` int DEFAULT NULL,
  `fcdi_score` int DEFAULT NULL COMMENT 'Forensic Confidence Degradation Index 0-100',
  `forensic_execution_ledger_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assumption_registry_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `economic_context_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ife_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `doe_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fel_version_snapshot_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_quality_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `forensic_audit_validation_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unresolved_parts_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Parts the AI generated that could not be resolved to canonical names. JSON array of strings.',
  `shared_with_roles_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_override` tinyint DEFAULT '0',
  `human_override_user_id` int DEFAULT NULL,
  `human_override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_override_at` bigint DEFAULT NULL,
  `ocr_fallback_used` tinyint DEFAULT '0',
  `pipeline_degraded_stages_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_classification_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'C-09: Photo classification cache — JSON array of { url, category, confidence } objects. Populated at pipeline ingestion (Stage 2.6) and by classifyPhotoUrls tRPC procedure. Prevents redundant LLM vision calls on every report page open.',
  `claim_truth_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_signals_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_registry_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `system_intervention_count` int DEFAULT NULL,
  `intervention_summary_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision_readiness_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Batch 2c: Stage 10 Decision Readiness Engine result (JSON). Schema: { decision_ready, confidence, blocking_issues[], checks[], summary }',
  `degradation_reasons_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Batch 2c: Stage 10 degradation reasons (JSON string[]). Empty array when report is not degraded.',
  `field_validation_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Batch 2d: Stage 4 field-level validation result (JSON FieldValidationResult).',
  `gate_decision_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Batch 2d: Stage 4 pipeline gate decision (JSON GateControllerResult).',
  `claim_truth_object_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `physics_truth_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Wave 1 Physics Truth Layer — canonical immutable physics object with full provenance, uncertainty, and confidence at every field. Built by buildPhysicsTruth() after Stage 7 completes.',
  `direction_contradiction_flag_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cross_validation_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cgi_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Stage 9.5 CGI result JSON — Stage9_5Output with layer1/layer2 indicators, conclusion, hiddenDamageProbabilityOverride',
  `interpretation_result_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ai_assessments_claim_id` (`claim_id`),
  KEY `idx_ai_claim_confidence` (`claim_id`,`confidence_score`),
  KEY `idx_ai_tenant_fraud` (`tenant_id`,`fraud_risk_level`),
  KEY `idx_ai_assessments_claim` (`claim_id`),
  KEY `idx_ai_assessments_created` (`created_at`),
  KEY `idx_ai_assessments_fraud_score` (`fraud_score`),
  CONSTRAINT `restore_fk_ai_assessments_fk_ai_assessments_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=25620001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ai_prediction_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ai_prediction_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `prediction_type` enum('cost_estimate','fraud_detection','document_classification','damage_assessment','repair_vs_replace','total_loss_determination','physics_validation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `input_summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `input_tokens` int DEFAULT NULL,
  `predicted_value` decimal(12,2) DEFAULT NULL,
  `predicted_label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence_score` decimal(5,4) DEFAULT NULL,
  `prediction_json` json DEFAULT NULL,
  `actual_value` decimal(12,2) DEFAULT NULL,
  `actual_label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `variance_amount` decimal(12,2) DEFAULT NULL,
  `variance_percent` decimal(8,2) DEFAULT NULL,
  `is_accurate` tinyint DEFAULT NULL,
  `processing_time_ms` int DEFAULT NULL,
  `output_tokens` int DEFAULT NULL,
  `total_cost` decimal(10,6) DEFAULT NULL,
  `error_occurred` tinyint DEFAULT '0',
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_apl_claim` (`historical_claim_id`),
  KEY `idx_apl_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `anonymization_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `anonymization_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `source_record_id` int NOT NULL COMMENT 'FK to claim_intelligence_dataset.id',
  `anonymous_record_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'UUID in global_anonymized_dataset (NULL if withheld)',
  `status` enum('success','withheld_k_anonymity','withheld_pii_detected','withheld_tenant_opt_out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quasi_identifier_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SHA256 hash of [make, model, year_bracket, type, province]',
  `group_size` int DEFAULT NULL COMMENT 'Number of records sharing same quasi-identifier',
  `transformations_applied` json DEFAULT NULL COMMENT 'List of transformations applied',
  `anonymized_by_user_id` int DEFAULT NULL COMMENT 'System user ID (for manual anonymization)',
  `anonymized_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_aal_source_record` (`source_record_id`),
  KEY `idx_aal_status` (`status`),
  KEY `idx_aal_anonymized_at` (`anonymized_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessor_id` int NOT NULL,
  `appointment_type` enum('claimant_inspection','panel_beater_inspection') COLLATE utf8mb4_unicode_ci NOT NULL,
  `claimant_id` int DEFAULT NULL,
  `panel_beater_id` int DEFAULT NULL,
  `scheduled_date` timestamp NOT NULL,
  `location` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('scheduled','confirmed','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_appointments_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_appointments_fk_appointments_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `approval_workflow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_workflow` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `level` enum('assessor','risk_surveyor','risk_manager') COLLATE utf8mb4_unicode_ci NOT NULL,
  `level_order` int NOT NULL,
  `approver_id` int DEFAULT NULL,
  `approver_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approver_role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `approved_amount` int DEFAULT NULL,
  `comments` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `conditions` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `return_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `return_to_level` enum('assessor','risk_surveyor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `approval_date` timestamp NULL DEFAULT NULL,
  `is_escalated` tinyint DEFAULT '0',
  `escalation_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_approval_workflow_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_approval_workflow_fk_approval_workflow_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_deviation_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_deviation_metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assessor_id` int DEFAULT NULL,
  `assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `total_claims` int NOT NULL,
  `average_deviation` decimal(5,2) DEFAULT NULL,
  `median_deviation` decimal(5,2) DEFAULT NULL,
  `standard_deviation` decimal(5,2) DEFAULT NULL,
  `overvaluation_rate` decimal(5,2) DEFAULT NULL,
  `undervaluation_rate` decimal(5,2) DEFAULT NULL,
  `consistency_score` int DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `panel_beater_id` int DEFAULT NULL,
  `data_quality_score` int DEFAULT NULL,
  `sample_size` int DEFAULT NULL,
  `calculated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_evaluations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessor_id` int NOT NULL,
  `inspection_date` timestamp NULL DEFAULT NULL,
  `inspection_photos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','in_progress','completed','submitted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `estimated_repair_cost` int DEFAULT NULL,
  `labor_cost` int DEFAULT NULL,
  `parts_cost` int DEFAULT NULL,
  `estimated_duration` int DEFAULT NULL,
  `damage_assessment` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recommendations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_risk_level` enum('low','medium','moderate','high') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disagrees_with_ai` tinyint(1) DEFAULT '0',
  `ai_disagreement_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_report_id` int DEFAULT NULL,
  `source_report_version` int DEFAULT NULL,
  `accepted_review_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_evaluations_claim_id` (`claim_id`),
  KEY `idx_evaluations_assessor_id` (`assessor_id`),
  KEY `fk_assessor_evaluations_source_report` (`source_report_id`),
  KEY `fk_assessor_evaluations_accepted_review` (`accepted_review_id`),
  KEY `idx_assessor_evaluations_source_report` (`source_report_id`),
  CONSTRAINT `restore_fk_assessor_evaluations_fk_assessor_evaluations_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_evaluations_fk_assessor_evaluations_sour` FOREIGN KEY (`source_report_id`) REFERENCES `assessor_reports` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_evaluations_fk_assessor_evaluations_acce` FOREIGN KEY (`accepted_review_id`) REFERENCES `assessor_report_reviews` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=9690001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_insurer_relationships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_insurer_relationships` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assessor_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_type` enum('insurer_owned','marketplace_contract','preferred_vendor') COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_status` enum('active','suspended','terminated') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `contract_start_date` timestamp NOT NULL,
  `contract_end_date` timestamp NULL DEFAULT NULL,
  `contracted_rate_per_assessment` decimal(10,2) DEFAULT NULL,
  `marketplace_commission_rate` decimal(5,2) DEFAULT NULL,
  `performance_rating` decimal(3,2) DEFAULT NULL,
  `total_assignments_completed` int DEFAULT '0',
  `total_assignments_rejected` int DEFAULT '0',
  `average_completion_time_hours` decimal(8,2) DEFAULT NULL,
  `is_preferred_vendor` tinyint DEFAULT '0',
  `preferred_vendor_since` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_assessor_tenant` (`assessor_id`,`tenant_id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_type` (`relationship_type`),
  KEY `idx_status` (`relationship_status`),
  KEY `idx_preferred` (`is_preferred_vendor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=10290001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_marketplace_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_marketplace_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assessor_id` int NOT NULL,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewer_user_id` int NOT NULL,
  `overall_rating` int NOT NULL,
  `accuracy_rating` int DEFAULT NULL,
  `professionalism_rating` int DEFAULT NULL,
  `timeliness_rating` int DEFAULT NULL,
  `communication_rating` int DEFAULT NULL,
  `review_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `would_hire_again` tinyint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_claim_review` (`claim_id`,`reviewer_user_id`),
  KEY `idx_assessor` (`assessor_id`),
  KEY `idx_rating` (`overall_rating`),
  KEY `idx_tenant` (`tenant_id`),
  CONSTRAINT `restore_fk_assessor_marketplace_reviews_fk_assessor_marketpl` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=10050001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name_aliases` json DEFAULT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accreditation_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accreditation_body` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accreditation_expiry` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurer_affiliations` json DEFAULT NULL,
  `total_claims_assessed` int DEFAULT '0',
  `avg_cost_reduction_pct` decimal(5,2) DEFAULT NULL,
  `avg_cost_uplift_pct` decimal(5,2) DEFAULT NULL,
  `panel_beater_routing` json DEFAULT NULL,
  `top_panel_beater_id` int DEFAULT NULL,
  `top_panel_beater_pct` decimal(5,2) DEFAULT NULL,
  `routing_concentration_score` int DEFAULT '0',
  `cost_suppression_claims` int DEFAULT '0',
  `structural_gap_claims` int DEFAULT '0',
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `is_watchlisted` tinyint DEFAULT '0',
  `watchlist_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ar_full_name` (`full_name`),
  KEY `idx_ar_routing_concentration` (`routing_concentration_score`),
  KEY `idx_ar_risk_score` (`risk_score`),
  KEY `idx_ar_tenant` (`tenant_id`),
  KEY `idx_ar_watchlisted` (`is_watchlisted`),
  KEY `idx_assessor_registry_tenant` (`tenant_id`),
  KEY `idx_assessor_routing` (`routing_concentration_score`),
  KEY `idx_assessor_watchlist` (`is_watchlisted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=480001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_report_attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_report_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_file_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storage_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size_bytes` int DEFAULT NULL,
  `file_hash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_role` enum('original_report','supporting_evidence','generated_export') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'supporting_evidence',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_assessor_report_attachments_report` (`report_id`),
  KEY `idx_assessor_report_attachments_tenant` (`tenant_id`),
  CONSTRAINT `restore_fk_assessor_report_attachments_fk_assessor_report_at` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_report_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_report_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewer_user_id` int NOT NULL,
  `reviewer_role` enum('claims_assessor','claims_manager') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','accepted','returned','rejected','escalated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `route_reason` enum('assigned_claims_assessor','claims_manager_fallback','claims_manager_escalation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `decision_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_assessor_report_reviews_reviewer_state` (`reviewer_user_id`,`status`),
  KEY `idx_assessor_report_reviews_claim_state` (`claim_id`,`status`),
  KEY `idx_assessor_report_reviews_tenant_state` (`tenant_id`,`status`),
  KEY `fk_assessor_report_reviews_report` (`report_id`),
  CONSTRAINT `restore_fk_assessor_report_reviews_fk_assessor_report_review` FOREIGN KEY (`report_id`) REFERENCES `assessor_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_report_reviews_fk_assessor_report_reviews_cl` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_report_reviews_fk_assessor_report_reviews_re` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2400001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assessor_user_id` int NOT NULL,
  `assignment_id` int NOT NULL,
  `parent_report_id` int DEFAULT NULL,
  `version_number` int NOT NULL DEFAULT '1',
  `creation_method` enum('native_upload','kinga_assisted') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','attested','submitted','under_review','returned','rejected','accepted','superseded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_file_name` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_storage_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_file_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_mime_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_file_hash` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_payload` json DEFAULT NULL,
  `kinga_extraction_json` json DEFAULT NULL,
  `attested_by_user_id` int DEFAULT NULL,
  `attested_at` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `superseded_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_assessor_reports_claim_state` (`claim_id`,`status`),
  KEY `idx_assessor_reports_assessor_state` (`assessor_user_id`,`status`),
  KEY `idx_assessor_reports_tenant_state` (`tenant_id`,`status`),
  UNIQUE KEY `uq_assessor_reports_claim_version` (`claim_id`,`version_number`),
  KEY `fk_assessor_reports_assignment` (`assignment_id`),
  KEY `fk_assessor_reports_parent` (`parent_report_id`),
  KEY `fk_assessor_reports_attester` (`attested_by_user_id`),
  CONSTRAINT `restore_fk_assessor_reports_fk_assessor_reports_claim` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_reports_fk_assessor_reports_assessor` FOREIGN KEY (`assessor_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_reports_fk_assessor_reports_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `claim_assignments` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_reports_fk_assessor_reports_parent` FOREIGN KEY (`parent_report_id`) REFERENCES `assessor_reports` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_assessor_reports_fk_assessor_reports_attester` FOREIGN KEY (`attested_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2400001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessor_subscriptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessor_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `marketplace_profile_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `tier` enum('free','pro') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  `max_claims_per_month` int NOT NULL DEFAULT '10',
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_assessor_sub_profile` (`marketplace_profile_id`),
  UNIQUE KEY `uq_assessor_sub_user` (`user_id`),
  KEY `idx_assessor_sub_tier` (`tier`),
  KEY `idx_assessor_sub_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=9660001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `assessors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `assessors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `professional_license_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_expiry_date` timestamp NOT NULL,
  `assessor_type` enum('insurer_owned','marketplace','hybrid') COLLATE utf8mb4_unicode_ci NOT NULL,
  `primary_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marketplace_enabled` tinyint NOT NULL DEFAULT '0',
  `marketplace_status` enum('pending_approval','active','suspended','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_approval',
  `marketplace_onboarded_at` timestamp NULL DEFAULT NULL,
  `marketplace_bio` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marketplace_hourly_rate` decimal(10,2) DEFAULT NULL,
  `marketplace_availability` enum('full_time','part_time','weekends_only','on_demand') COLLATE utf8mb4_unicode_ci DEFAULT 'on_demand',
  `specializations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certifications` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certification_level` enum('junior','senior','expert','master') COLLATE utf8mb4_unicode_ci NOT NULL,
  `years_of_experience` int DEFAULT NULL,
  `service_regions` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `max_travel_distance_km` int DEFAULT '50',
  `active_status` tinyint NOT NULL DEFAULT '1',
  `performance_score` decimal(5,2) DEFAULT NULL,
  `total_assessments_completed` int DEFAULT '0',
  `average_accuracy_score` decimal(5,2) DEFAULT NULL,
  `average_turnaround_hours` decimal(8,2) DEFAULT NULL,
  `average_rating` decimal(3,2) DEFAULT NULL,
  `total_ratings_count` int DEFAULT '0',
  `total_marketplace_earnings` decimal(12,2) DEFAULT '0.00',
  `pending_payout` decimal(12,2) DEFAULT '0.00',
  `last_payout_date` timestamp NULL DEFAULT NULL,
  `background_check_status` enum('pending','passed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `background_check_date` timestamp NULL DEFAULT NULL,
  `insurance_verified` tinyint DEFAULT '0',
  `insurance_expiry_date` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_type` (`assessor_type`),
  KEY `idx_marketplace_status` (`marketplace_status`),
  KEY `idx_primary_tenant` (`primary_tenant_id`),
  KEY `idx_performance` (`performance_score`),
  KEY `idx_rating` (`average_rating`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `professional_license_number` (`professional_license_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=10290001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `asset_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_ref` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_type` enum('vehicle','equipment','building','transformer','fire_system','solar_plant','wind_turbine','substation','industrial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `asset_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manufacturer` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year_manufactured` int DEFAULT NULL,
  `location_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_lat` decimal(10,7) DEFAULT NULL,
  `location_lng` decimal(10,7) DEFAULT NULL,
  `owner_id` int DEFAULT NULL,
  `owner_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_inspection_id` int DEFAULT NULL,
  `last_inspected_at` timestamp NULL DEFAULT NULL,
  `inspection_count` int NOT NULL DEFAULT '0',
  `risk_rating` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata_json` json DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idx_ar_ref` (`asset_ref`),
  KEY `idx_ar_tenant` (`tenant_id`),
  KEY `idx_ar_type` (`asset_type`),
  KEY `idx_ar_vehicle_reg` (`vehicle_registration`),
  KEY `idx_ar_owner` (`owner_id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` enum('create','update','approve','reject','view','delete') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `before_state` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `after_state` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `integrity_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_trail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_trail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `user_id` int NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `previous_value` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_value` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `change_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_audit_claim_id` (`claim_id`),
  KEY `idx_audit_user_id` (`user_id`),
  KEY `idx_audit_created_at` (`created_at`),
  CONSTRAINT `restore_fk_audit_trail_fk_audit_trail_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=16500001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `automation_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence_score_id` int NOT NULL,
  `composite_confidence_score` decimal(5,2) NOT NULL,
  `routing_decision_id` int NOT NULL,
  `routed_workflow` enum('ai_only','hybrid','manual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `routing_reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `automation_policy_id` int NOT NULL,
  `policy_snapshot` json NOT NULL,
  `ai_estimated_cost` bigint NOT NULL,
  `assessor_adjusted_cost` bigint DEFAULT NULL,
  `final_approved_cost` bigint DEFAULT NULL,
  `cost_variance_ai_vs_final` decimal(5,2) DEFAULT NULL,
  `decision_made_at` timestamp NOT NULL,
  `claim_approved_at` timestamp NULL DEFAULT NULL,
  `claim_rejected_at` timestamp NULL DEFAULT NULL,
  `was_overridden` tinyint(1) NOT NULL DEFAULT '0',
  `override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overridden_by_user_id` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_routed_workflow` (`routed_workflow`),
  KEY `idx_composite_score` (`composite_confidence_score`),
  KEY `idx_decision_made_at` (`decision_made_at`),
  KEY `idx_was_overridden` (`was_overridden`),
  KEY `fk_1` (`confidence_score_id`),
  KEY `fk_2` (`routing_decision_id`),
  KEY `fk_3` (`automation_policy_id`),
  CONSTRAINT `restore_fk_automation_audit_log_fk_1` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores` (`id`),
  CONSTRAINT `restore_fk_automation_audit_log_fk_2` FOREIGN KEY (`routing_decision_id`) REFERENCES `claim_routing_decisions` (`id`),
  CONSTRAINT `restore_fk_automation_audit_log_fk_3` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies` (`id`),
  CONSTRAINT `restore_fk_automation_audit_log_fk_automation_audit_log_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `automation_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_policies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_automation_confidence` int NOT NULL DEFAULT '85',
  `min_hybrid_confidence` int NOT NULL DEFAULT '60',
  `eligible_claim_types` json NOT NULL,
  `excluded_claim_types` json NOT NULL,
  `max_ai_only_approval_amount` bigint NOT NULL DEFAULT '5000000',
  `max_hybrid_approval_amount` bigint NOT NULL DEFAULT '20000000',
  `max_fraud_score_for_automation` int NOT NULL DEFAULT '30',
  `eligible_vehicle_categories` json NOT NULL,
  `excluded_vehicle_makes` json NOT NULL,
  `min_vehicle_year` int NOT NULL DEFAULT '2010',
  `max_vehicle_age` int NOT NULL DEFAULT '15',
  `require_manager_approval_above` bigint NOT NULL DEFAULT '10000000',
  `allow_policy_override` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_user_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `version` int NOT NULL DEFAULT '1',
  `effective_from` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `effective_until` timestamp NULL DEFAULT NULL,
  `superseded_by_policy_id` int DEFAULT NULL,
  `fraud_sensitivity_multiplier` decimal(3,2) NOT NULL DEFAULT '1.00' COMMENT '0.5 (lenient) to 2.0 (strict)',
  `demand_letter_response_days` int NOT NULL DEFAULT '21',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_tenant_active` (`tenant_id`,`is_active`),
  KEY `idx_policy_name` (`policy_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8760001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `benchmark_deviations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `benchmark_deviations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_class` enum('light','medium','heavy') COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_segment` enum('economy','mid-range','premium','luxury','commercial') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mid-range',
  `year_band` enum('pre2000','2000-2009','2010-2019','2020plus') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '2010-2019',
  `damage_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('minor','moderate','severe') COLLATE utf8mb4_unicode_ci NOT NULL,
  `impact_zone` enum('front','rear','side','multi','non-directional') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'front',
  `region` enum('ZA','ZW','UK','US','AU') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZA',
  `benchmark_source` enum('static','blended','live') COLLATE utf8mb4_unicode_ci NOT NULL,
  `comparable_claim_count` int NOT NULL DEFAULT '0',
  `cost_value_cents` int DEFAULT NULL,
  `cost_benchmark_low_cents` int DEFAULT NULL,
  `cost_benchmark_high_cents` int DEFAULT NULL,
  `cost_benchmark_mean_cents` int DEFAULT NULL,
  `cost_deviation_pct` decimal(7,2) DEFAULT NULL,
  `cost_deviation_flag` tinyint DEFAULT '0',
  `cost_narrative` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `physics_value_kmh` decimal(7,2) DEFAULT NULL,
  `physics_benchmark_low_kmh` decimal(7,2) DEFAULT NULL,
  `physics_benchmark_high_kmh` decimal(7,2) DEFAULT NULL,
  `physics_benchmark_mean_kmh` decimal(7,2) DEFAULT NULL,
  `physics_deviation_pct` decimal(7,2) DEFAULT NULL,
  `physics_deviation_flag` tinyint DEFAULT '0',
  `physics_narrative` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_value_score` decimal(6,4) DEFAULT NULL,
  `fraud_benchmark_low` decimal(6,4) DEFAULT NULL,
  `fraud_benchmark_high` decimal(6,4) DEFAULT NULL,
  `fraud_benchmark_mean` decimal(6,4) DEFAULT NULL,
  `fraud_deviation_pct` decimal(7,2) DEFAULT NULL,
  `fraud_deviation_flag` tinyint DEFAULT '0',
  `fraud_narrative` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overall_deviation_flag` tinyint DEFAULT '0',
  `benchmark_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_bmd_claim_id` (`claim_id`),
  KEY `idx_bmd_tenant_id` (`tenant_id`),
  KEY `idx_bmd_vehicle_class` (`vehicle_class`),
  KEY `idx_bmd_damage_type` (`damage_type`),
  KEY `idx_bmd_overall_flag` (`overall_deviation_flag`),
  KEY `idx_bmd_created_at` (`created_at`),
  CONSTRAINT `restore_fk_benchmark_deviations_fk_benchmark_deviations_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bias_detection_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `bias_detection_flags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` int DEFAULT NULL,
  `bias_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `affected_claims_count` int DEFAULT '0',
  `mitigation_recommendation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_bias_flags_tenant_id` (`tenant_id`),
  KEY `idx_bias_flags_batch_id` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `calibration_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `calibration_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jurisdiction` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scenario_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_multiplier` int DEFAULT NULL,
  `fraud_adjustments_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risk_level` enum('LOW','MEDIUM','HIGH') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MEDIUM',
  `reasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sample_size` int NOT NULL DEFAULT '0',
  `confidence` int NOT NULL DEFAULT '0',
  `status` enum('pending_review','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_review',
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_reports_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cal_tenant_jurisdiction` (`tenant_id`,`jurisdiction`),
  KEY `idx_cal_status` (`status`),
  KEY `idx_cal_scenario` (`scenario_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_approvals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workflow_template_id` int DEFAULT NULL,
  `stage_order` int NOT NULL,
  `stage_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  `actor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision` enum('approved','rejected','returned','escalated','external_received') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ca_claim_id` (`claim_id`),
  KEY `idx_ca_tenant_id` (`tenant_id`),
  KEY `idx_ca_stage_order` (`claim_id`,`stage_order`),
  KEY `idx_ca_role_key` (`role_key`),
  KEY `idx_ca_acted_at` (`acted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=150001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assignment_role` enum('assessor','claims_assessor','claims_manager') COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_to_user_id` int NOT NULL,
  `assigned_by_user_id` int DEFAULT NULL,
  `assignment_source` enum('manual','workflow','reassignment','system','legacy_import') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `status` enum('assigned','accepted','declined','reassigned','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'assigned',
  `parent_assignment_id` int DEFAULT NULL,
  `in_app_notification_created` tinyint NOT NULL DEFAULT '0',
  `email_notification_requested` tinyint NOT NULL DEFAULT '0',
  `email_notification_sent_at` timestamp NULL DEFAULT NULL,
  `email_notification_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decision_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `declined_at` timestamp NULL DEFAULT NULL,
  `reassigned_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_assignments_claim_active` (`claim_id`,`status`),
  KEY `idx_claim_assignments_assignee_active` (`assigned_to_user_id`,`status`),
  KEY `idx_claim_assignments_tenant_role` (`tenant_id`,`assignment_role`,`status`),
  KEY `idx_claim_assignments_parent` (`parent_assignment_id`),
  KEY `fk_claim_assignments_assigner` (`assigned_by_user_id`),
  CONSTRAINT `restore_fk_claim_assignments_fk_claim_assignments_claim` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_claim_assignments_fk_claim_assignments_assignee` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_claim_assignments_fk_claim_assignments_assigner` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_claim_assignments_fk_claim_assignments_parent` FOREIGN KEY (`parent_assignment_id`) REFERENCES `claim_assignments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2790001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_comment_reads`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_comment_reads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `comment_id` int NOT NULL,
  `user_id` int NOT NULL,
  `read_at` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ccr_comment_id` (`comment_id`),
  KEY `idx_ccr_user_id` (`user_id`),
  UNIQUE KEY `uq_ccr_comment_user` (`comment_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claimId` int NOT NULL,
  `author_user_id` int NOT NULL,
  `author_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_roles` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_user_ids` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_emails` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment_type` enum('clarification','instruction','escalation','approval_note','rejection_note','inspection_request','general') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `requires_response` tinyint NOT NULL DEFAULT '0',
  `response_deadline_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_comment_id` int DEFAULT NULL,
  `is_resolved` tinyint NOT NULL DEFAULT '0',
  `resolved_by_user_id` int DEFAULT NULL,
  `resolved_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_sent` tinyint NOT NULL DEFAULT '0',
  `notify_claimant` tinyint NOT NULL DEFAULT '0',
  `claimant_email_sent` tinyint NOT NULL DEFAULT '0',
  `status_update_template` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deletedAt` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subsection_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finding_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pipeline_run_id` int DEFAULT NULL,
  `severity` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `disposition` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `blocks_approval` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_1` (`claimId`),
  KEY `fk_2` (`author_user_id`),
  KEY `idx_cc_author_user_id` (`author_user_id`),
  KEY `idx_cc_parent_comment_id` (`parent_comment_id`),
  KEY `idx_cc_section` (`claimId`,`section_key`,`pipeline_run_id`),
  KEY `idx_cc_blocks` (`claimId`,`blocks_approval`,`is_resolved`),
  CONSTRAINT `restore_fk_claim_comments_fk_1` FOREIGN KEY (`claimId`) REFERENCES `claims` (`id`),
  CONSTRAINT `restore_fk_claim_comments_fk_2` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=7260001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_confidence_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_confidence_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `damage_certainty` decimal(5,2) NOT NULL,
  `physics_strength` decimal(5,2) NOT NULL,
  `fraud_confidence` decimal(5,2) NOT NULL,
  `historical_accuracy` decimal(5,2) NOT NULL,
  `data_completeness` decimal(5,2) NOT NULL,
  `vehicle_risk_intelligence` decimal(5,2) NOT NULL,
  `composite_confidence_score` decimal(5,2) NOT NULL,
  `scoring_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1.0',
  `scoring_timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  `damage_certainty_breakdown` json DEFAULT NULL,
  `physics_validation_details` json DEFAULT NULL,
  `fraud_analysis_details` json DEFAULT NULL,
  `historical_accuracy_details` json DEFAULT NULL,
  `data_completeness_details` json DEFAULT NULL,
  `vehicle_risk_details` json DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_composite_score` (`composite_confidence_score`),
  KEY `idx_scoring_timestamp` (`scoring_timestamp`),
  CONSTRAINT `restore_fk_claim_confidence_scores_fk_claim_confidence_score` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=540001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_decision_lifecycle`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_decision_lifecycle` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lifecycle_state` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `is_final` tinyint NOT NULL DEFAULT '0',
  `is_locked` tinyint NOT NULL DEFAULT '0',
  `authoritative_snapshot_id` int DEFAULT NULL,
  `drafted_at` bigint DEFAULT NULL,
  `reviewed_at` bigint DEFAULT NULL,
  `reviewed_by_user_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finalised_at` bigint DEFAULT NULL,
  `finalised_by_user_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locked_at` bigint DEFAULT NULL,
  `locked_by_user_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `final_decision_choice` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  `reviewed_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `finalised_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locked_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `override_flag` tinyint NOT NULL DEFAULT '0',
  `ai_decision` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_decision` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_cdl_claim_unique` (`claim_id`),
  KEY `idx_cdl_tenant` (`tenant_id`),
  KEY `idx_cdl_state` (`lifecycle_state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=570001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `uploaded_by` int NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_category` enum('damage_photo','repair_quote','invoice','police_report','medical_report','insurance_policy','correspondence','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `visible_to_roles` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `inspection_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_uploaded_by` (`uploaded_by`),
  KEY `idx_category` (`document_category`),
  KEY `fk_claim_doc_inspection` (`inspection_id`),
  CONSTRAINT `restore_fk_claim_documents_fk_claim_documents_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `restore_fk_claim_documents_fk_claim_doc_inspection` FOREIGN KEY (`inspection_id`) REFERENCES `inspections` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8250001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `event_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_payload` json DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ce_claim_id` (`claim_id`),
  KEY `idx_ce_event_type` (`event_type`),
  KEY `idx_ce_emitted_at` (`emitted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=10500001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_evidence_findings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_evidence_findings` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `assessment_id` int DEFAULT NULL,
  `evidence_domain` enum('monetary','damage','fraud','vehicle_history','decision') COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence_status` enum('verified','reconstructed','documented_revision','scope_difference','extraction_defect','evidence_gap','pricing_variance_review_signal','unresolved') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('info','review','blocking') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `finding_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_document_id` int DEFAULT NULL,
  `source_page` int DEFAULT NULL,
  `source_location` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_type` enum('document','quote_line','image','system_record','benchmark','reconstruction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_id` int DEFAULT NULL,
  `quote_line_item_id` int DEFAULT NULL,
  `subject_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observed_value_cents` bigint unsigned DEFAULT NULL,
  `comparison_value_cents` bigint unsigned DEFAULT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tax_basis` enum('included','excluded','separately_stated','not_stated','not_applicable') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scope_fingerprint` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_json` json DEFAULT NULL,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `claim_evidence_findings_tenant_claim_idx` (`tenant_id`,`claim_id`),
  KEY `claim_evidence_findings_quote_idx` (`quote_id`,`quote_line_item_id`),
  KEY `claim_evidence_findings_status_idx` (`evidence_status`,`severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=854181;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_features` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `assessment_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `delta_v` decimal(6,2) DEFAULT NULL,
  `crush_depth` decimal(6,2) DEFAULT NULL,
  `impact_force` decimal(12,2) DEFAULT NULL,
  `airbag_deployed` tinyint DEFAULT NULL,
  `component_count` int DEFAULT NULL,
  `structural_damage_flag` tinyint DEFAULT NULL,
  `damage_zone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_cost_usd` decimal(10,2) DEFAULT NULL,
  `true_cost_usd` decimal(10,2) DEFAULT NULL,
  `cost_deviation_pct` decimal(6,2) DEFAULT NULL,
  `structural_gap_count` int DEFAULT NULL,
  `cost_basis` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `driver_registry_id` int DEFAULT NULL,
  `claimant_registry_id` int DEFAULT NULL,
  `assessor_registry_id` int DEFAULT NULL,
  `panel_beater_registry_id` int DEFAULT NULL,
  `officer_registry_id` int DEFAULT NULL,
  `driver_total_claims` int DEFAULT NULL,
  `assessor_routing_hhi` decimal(5,4) DEFAULT NULL,
  `officer_concentration_score` int DEFAULT NULL,
  `incident_hour` int DEFAULT NULL,
  `incident_day_of_week` int DEFAULT NULL,
  `incident_is_night` tinyint DEFAULT NULL,
  `incident_is_weekend` tinyint DEFAULT NULL,
  `days_since_last_claim` int DEFAULT NULL,
  `days_since_policy_inception` int DEFAULT NULL,
  `photo_count` int DEFAULT NULL,
  `exif_present` tinyint DEFAULT NULL,
  `gps_present` tinyint DEFAULT NULL,
  `police_report_present` tinyint DEFAULT NULL,
  `licence_present` tinyint DEFAULT NULL,
  `fraud_indicators` json DEFAULT NULL,
  `rule_based_fraud_score` int DEFAULT NULL,
  `incident_lat` decimal(10,7) DEFAULT NULL,
  `incident_lng` decimal(10,7) DEFAULT NULL,
  `incident_location_raw` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `geocoding_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `fraud_probability` decimal(5,4) DEFAULT NULL,
  `true_cost_predicted` decimal(10,2) DEFAULT NULL,
  `repair_probability` decimal(5,4) DEFAULT NULL,
  `settlement_predicted` decimal(10,2) DEFAULT NULL,
  `hotspot_cluster_id` int DEFAULT NULL,
  `label_fraud` tinyint DEFAULT NULL,
  `label_outcome` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `label_settlement_usd` decimal(10,2) DEFAULT NULL,
  `labelled_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_cf_claim_id` (`claim_id`),
  KEY `idx_cf_tenant` (`tenant_id`),
  KEY `idx_cf_geocoding_status` (`geocoding_status`),
  KEY `idx_cf_incident_hour` (`incident_hour`),
  KEY `idx_cf_fraud_probability` (`fraud_probability`),
  KEY `idx_cf_hotspot_cluster` (`hotspot_cluster_id`),
  KEY `idx_cf_label_fraud` (`label_fraud`),
  CONSTRAINT `restore_fk_claim_features_fk_claim_features_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=10800001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_intake_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_intake_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `idempotency_key` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `request_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `channel` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('persisted','assessment_starting','assessment_started','assessment_start_failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'persisted',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_claim_intake_request_actor` (`tenant_id`,`user_id`,`idempotency_key`),
  KEY `idx_claim_intake_request_claim` (`claim_id`),
  KEY `idx_claim_intake_request_tenant_status` (`tenant_id`,`status`),
  CONSTRAINT `restore_fk_claim_intake_requests_fk_claim_intake_request_cla` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=780001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_intelligence_dataset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_intelligence_dataset` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schema_version` int NOT NULL DEFAULT '1',
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_mass` int DEFAULT NULL,
  `accident_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `impact_direction` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_description_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_report_presence` tinyint DEFAULT '0',
  `detected_damage_components` json DEFAULT NULL,
  `damage_severity_scores` json DEFAULT NULL,
  `llm_damage_reasoning` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `physics_plausibility_score` int DEFAULT NULL,
  `ai_estimated_cost` int DEFAULT NULL,
  `assessor_adjusted_cost` int DEFAULT NULL,
  `insurer_approved_cost` int DEFAULT NULL,
  `cost_variance_ai_vs_assessor` int DEFAULT NULL,
  `cost_variance_assessor_vs_final` int DEFAULT NULL,
  `cost_variance_ai_vs_final` int DEFAULT NULL,
  `ai_fraud_score` int DEFAULT NULL,
  `fraud_explanation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `final_fraud_outcome` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_id` int DEFAULT NULL,
  `assessor_tier` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessment_turnaround_hours` decimal(10,2) DEFAULT NULL,
  `reassignment_count` int DEFAULT '0',
  `approval_timeline_hours` decimal(10,2) DEFAULT NULL,
  `captured_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_scope` enum('tenant_private','tenant_feature') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tenant_private' COMMENT 'Data intelligence tier: tenant_private (full-fidelity) or tenant_feature (de-identified)',
  `global_sharing_enabled` tinyint DEFAULT '0' COMMENT 'Tenant opt-in for global dataset inclusion (POPIA/GDPR consent)',
  `anonymized_at` timestamp NULL DEFAULT NULL COMMENT 'When record was anonymized for global dataset',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cid_claim_id` (`claim_id`),
  KEY `idx_cid_tenant_id` (`tenant_id`),
  KEY `idx_cid_captured_at` (`captured_at`),
  KEY `idx_cid_schema_version` (`schema_version`),
  KEY `idx_data_scope` (`data_scope`),
  KEY `idx_global_sharing` (`global_sharing_enabled`),
  KEY `idx_anonymized_at` (`anonymized_at`),
  CONSTRAINT `restore_fk_claim_intelligence_dataset_fk_claim_intelligence_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5970001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_involvement_tracking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_involvement_tracking` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `user_id` int NOT NULL,
  `workflow_stage` enum('assessment','technical_approval','financial_decision','payment_authorization') COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` enum('transition_state','approve_technical','authorize_payment','close_claim','redirect_claim','add_assessment','complete_assessment','start_assessment','submit_quote','request_info','escalate') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_involvement_claim_user_stage` (`claim_id`,`user_id`,`workflow_stage`),
  KEY `idx_involvement_claim_user` (`claim_id`,`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=14040001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_review_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_review_queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_status` enum('pending_review','in_review','approved','rejected','needs_more_info') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_review',
  `review_priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `routed_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `automated_validation_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_to` int DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `review_decision` enum('approve','reject','request_more_info') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `review_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `include_in_training_dataset` tinyint DEFAULT '0',
  `include_in_reference_dataset` tinyint DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `claim_review_queue_historical_claim_id_unique` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claim_routing_decisions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claim_routing_decisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence_score_id` int NOT NULL,
  `automation_policy_id` int NOT NULL,
  `routed_workflow` enum('ai_only','hybrid','manual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `routing_reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_thresholds_applied` json NOT NULL,
  `decision_timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  `decision_made_by_system` tinyint(1) NOT NULL DEFAULT '1',
  `decision_made_by_user_id` int DEFAULT NULL,
  `was_overridden` tinyint(1) NOT NULL DEFAULT '0',
  `override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overridden_by_user_id` int DEFAULT NULL,
  `overridden_at` timestamp NULL DEFAULT NULL,
  `policy_version` int NOT NULL DEFAULT '1',
  `policy_snapshot_json` json NOT NULL,
  `claim_version` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_routed_workflow` (`routed_workflow`),
  KEY `idx_decision_timestamp` (`decision_timestamp`),
  KEY `fk_1` (`confidence_score_id`),
  KEY `fk_2` (`automation_policy_id`),
  CONSTRAINT `restore_fk_claim_routing_decisions_fk_1` FOREIGN KEY (`confidence_score_id`) REFERENCES `claim_confidence_scores` (`id`),
  CONSTRAINT `restore_fk_claim_routing_decisions_fk_2` FOREIGN KEY (`automation_policy_id`) REFERENCES `automation_policies` (`id`),
  CONSTRAINT `restore_fk_claim_routing_decisions_fk_claim_routing_decision` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claimant_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claimant_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claimant_id` int NOT NULL,
  `claimant_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_claims` int NOT NULL DEFAULT '0',
  `approved_claims` int DEFAULT '0',
  `rejected_claims` int DEFAULT '0',
  `fraudulent_claims` int DEFAULT '0',
  `total_claim_amount` int DEFAULT '0',
  `average_claim_amount` int DEFAULT '0',
  `first_claim_date` timestamp NULL DEFAULT NULL,
  `last_claim_date` timestamp NULL DEFAULT NULL,
  `claim_frequency` int DEFAULT NULL,
  `unique_vehicles_count` int DEFAULT '0',
  `non_owner_accident_count` int DEFAULT '0',
  `insurer_change_count` int DEFAULT '0',
  `current_insurer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_insurers` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_locations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `high_risk_area_count` int DEFAULT '0',
  `risk_score` int DEFAULT '0',
  `risk_level` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'low',
  `is_high_risk_client` tinyint DEFAULT '0',
  `is_fraudster` tinyint DEFAULT '0',
  `is_blacklisted` tinyint DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claimant_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claimant_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name_aliases` json DEFAULT NULL,
  `id_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addresses` json DEFAULT NULL,
  `current_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_change_count` int DEFAULT '0',
  `phone_numbers` json DEFAULT NULL,
  `email_addresses` json DEFAULT NULL,
  `policy_numbers` json DEFAULT NULL,
  `insurer_ids` json DEFAULT NULL,
  `total_claims` int DEFAULT '0',
  `claims_approved` int DEFAULT '0',
  `claims_rejected` int DEFAULT '0',
  `claims_flagged` int DEFAULT '0',
  `total_claimed_value_cents` bigint DEFAULT '0',
  `total_paid_value_cents` bigint DEFAULT '0',
  `first_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avg_days_between_claims` decimal(6,1) DEFAULT NULL,
  `min_days_between_claims` int DEFAULT NULL,
  `claim_ids_json` json DEFAULT NULL,
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `is_watchlisted` tinyint DEFAULT '0',
  `watchlist_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cr_id_number` (`id_number`),
  KEY `idx_cr_full_name` (`full_name`),
  KEY `idx_cr_risk_score` (`risk_score`),
  KEY `idx_cr_total_claims` (`total_claims`),
  KEY `idx_cr_tenant` (`tenant_id`),
  KEY `idx_cr_watchlisted` (`is_watchlisted`),
  KEY `idx_claimant_registry_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=150001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `claims` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claimant_id` int DEFAULT NULL,
  `claim_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_date` timestamp NULL DEFAULT NULL,
  `incident_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `normalised_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_cause_label` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `key_facts_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_location` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_photos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_verified` tinyint DEFAULT NULL,
  `status` enum('submitted','triage','assessment_pending','assessment_in_progress','quotes_pending','comparison','repair_assigned','repair_in_progress','completed','rejected','intake_pending','assessment_complete','closed','document_validating','document_ready','analysis_running','analysis_complete','document_failed','recovery_attempted','human_review_required') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `workflow_state` enum('created','intake_queue','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed','ai_assessment_pending','ai_assessment_completed','manual_review') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_assessor_id` int DEFAULT NULL,
  `assigned_panel_beater_id` int DEFAULT NULL,
  `selected_panel_beater_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_assessment_triggered` tinyint DEFAULT '0',
  `ai_assessment_completed` tinyint DEFAULT '0',
  `fraud_risk_score` int DEFAULT NULL,
  `fraud_flags` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `complexity_score` enum('simple','moderate','complex','exceptional') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `external_assessment_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `workflowState` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `technicallyApprovedBy` int DEFAULT NULL,
  `technicallyApprovedAt` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `financiallyApprovedBy` int DEFAULT NULL,
  `financiallyApprovedAt` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAmount` double DEFAULT NULL,
  `closedBy` int DEFAULT NULL,
  `closedAt` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_risk_level` enum('low','medium','moderate','high') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requires_gm_consultation` tinyint DEFAULT '0',
  `technically_approved_by` int DEFAULT NULL,
  `technically_approved_at` timestamp NULL DEFAULT NULL,
  `financially_approved_by` int DEFAULT NULL,
  `financially_approved_at` timestamp NULL DEFAULT NULL,
  `approved_amount` int DEFAULT NULL,
  `closed_by` int DEFAULT NULL,
  `closed_at` timestamp NULL DEFAULT NULL,
  `lodged_by` enum('self','broker','agent','company_rep','family_member','legal_rep','other') COLLATE utf8mb4_unicode_ci DEFAULT 'self',
  `lodger_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lodger_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lodger_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lodger_company` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lodger_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lodger_relationship` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_id_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_mileage` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_engine_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_gvm` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_tare_weight` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_engine_capacity` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_fuel_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_first_registration_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_owner_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_licence_expiry_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_time` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_vehicle` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_report_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_station` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supporting_documents` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `assigned_processor_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `early_fraud_suspicion` tinyint NOT NULL DEFAULT '0',
  `estimated_claim_value` decimal(12,2) DEFAULT NULL COMMENT 'Snapshot from AI assessment at routing time',
  `final_approved_amount` decimal(12,2) DEFAULT NULL COMMENT 'Final approved amount (replaces approvedAmount)',
  `confidence_score` int DEFAULT NULL COMMENT 'Snapshot from AI assessment at routing time (0-100)',
  `routing_decision` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Snapshot: ai_only, hybrid, manual',
  `policy_version_id` int DEFAULT NULL COMMENT 'References automation_policies.id at routing time',
  `source_document_id` int DEFAULT NULL,
  `claim_source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_processing_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `panel_beater_choice_1` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FK: marketplace_profiles.id — first insurer-approved panel beater choice',
  `panel_beater_choice_2` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FK: marketplace_profiles.id — second insurer-approved panel beater choice',
  `panel_beater_choice_3` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'FK: marketplace_profiles.id — third insurer-approved panel beater choice',
  `is_simulated` tinyint(1) NOT NULL DEFAULT '0',
  `vehicle_market_value` int DEFAULT NULL COMMENT 'Vehicle market value in ZAR cents for repair ratio calculation',
  `vehicle_registry_id` int DEFAULT NULL,
  `driver_registry_id` int DEFAULT NULL,
  `third_party_driver_registry_id` int DEFAULT NULL,
  `ai_detected_incident_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_type_overridden` tinyint NOT NULL DEFAULT '0',
  `incident_type_override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_type_overridden_by` int DEFAULT NULL,
  `incident_type_overridden_at` timestamp NULL DEFAULT NULL,
  `incident_type_revalidation_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Insurance product type (e.g. EXCESS, COMPREHENSIVE) - distinct from policy number',
  `product_type_source` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Source attribution for product_type field',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `estimated_speed_kmh` decimal(6,1) DEFAULT NULL,
  `data_completeness_score` decimal(5,2) DEFAULT NULL,
  `insurer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `excess_amount_cents` int DEFAULT NULL,
  `claim_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_cost` int DEFAULT NULL,
  `extraction_retry_count` int NOT NULL DEFAULT '0',
  `extraction_failed_at` timestamp NULL DEFAULT NULL,
  `ai_assessment_started_at` timestamp NULL DEFAULT NULL,
  `ai_assessment_completed_at` timestamp NULL DEFAULT NULL,
  `pipeline_current_stage` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pipeline_run_uuid` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pipeline_heartbeat_at` timestamp NULL DEFAULT NULL,
  `kinga_ref` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fleet_account_id` int DEFAULT NULL,
  `claimant_type` enum('individual','company') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `claimant_company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_company_reg` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fleet_vehicle_ref` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recovery_retry_count` int NOT NULL DEFAULT '0',
  `claimant_stated_speed_kmh` decimal(6,1) DEFAULT NULL COMMENT 'IMMUTABLE: claimant-stated speed from Stage 3 extraction. Never overwritten by pipeline.',
  `claimant_speed_needs_verification` tinyint DEFAULT '0',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejection_category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejected_by` int DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `weather_conditions` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Weather at time of incident (from WhatsApp button)',
  `road_surface_wa` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Road surface from WhatsApp (distinct from accident reconstruction table)',
  `gps_lat` decimal(10,7) DEFAULT NULL COMMENT 'GPS latitude from WhatsApp location pin',
  `gps_lng` decimal(10,7) DEFAULT NULL COMMENT 'GPS longitude from WhatsApp location pin',
  `driver_is_self` tinyint(1) DEFAULT '1' COMMENT '1=owner was driving, 0=third party was driving',
  `driver_licence_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Driver licence number collected via WhatsApp',
  `licence_age_range` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'How long driver has held licence (e.g. over_10_years)',
  `licence_photo_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'S3 URL of driver licence photo',
  `police_attended` tinyint(1) DEFAULT NULL COMMENT '1=police attended, 0=not yet, NULL=unknown',
  `police_officer_details` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Officer name/badge from WhatsApp',
  `insurer_name_wa` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Insurer selected by client on WhatsApp',
  `wa_session_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'WhatsApp session ID that created this claim',
  `wa_phone_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Client WhatsApp phone number',
  `fleet_driver_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `claims_claim_number_unique` (`claim_number`),
  KEY `idx_claims_claimant_id` (`claimant_id`),
  KEY `idx_claims_assigned_assessor_id` (`assigned_assessor_id`),
  KEY `idx_claims_status` (`status`),
  KEY `idx_claims_created_at` (`created_at`),
  KEY `idx_claims_tenant_workflow_created` (`tenant_id`,`workflow_state`,`created_at`),
  KEY `idx_fraud_risk_score` (`fraud_risk_score`),
  KEY `idx_confidence_score` (`confidence_score`),
  KEY `idx_routing_decision` (`routing_decision`),
  KEY `idx_policy_version_id` (`policy_version_id`),
  KEY `idx_claims_tenant_status` (`tenant_id`,`status`),
  KEY `idx_claims_tenant_created` (`tenant_id`,`created_at`),
  UNIQUE KEY `idx_claims_source_document_id` (`source_document_id`),
  UNIQUE KEY `unique_source_document` (`source_document_id`),
  KEY `idx_claims_vehicle_registry_id` (`vehicle_registry_id`),
  KEY `idx_claims_driver_registry_id` (`driver_registry_id`),
  KEY `idx_claims_tp_driver_registry_id` (`third_party_driver_registry_id`),
  KEY `idx_claims_tenant_doc_status` (`tenant_id`,`document_processing_status`),
  KEY `idx_claims_assessment_started` (`ai_assessment_started_at`),
  KEY `idx_claims_assessment_completed` (`ai_assessment_completed_at`),
  KEY `idx_claims_incident_date` (`incident_date`),
  KEY `idx_claims_incident_location` (`incident_location`(100)),
  KEY `idx_claims_vehicle_reg` (`vehicle_registration`),
  KEY `idx_claims_tenant_claim_number` (`tenant_id`,`claim_number`),
  KEY `idx_claims_tenant_vehicle_reg` (`tenant_id`,`vehicle_registration`),
  KEY `idx_claims_tenant_policy_number` (`tenant_id`,`policy_number`),
  KEY `idx_claims_fleet_driver_id` (`fleet_driver_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=17589902;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_insurance_service_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_insurance_service_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cover_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_proposed_value_cents` int DEFAULT NULL,
  `request_payload_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('submitted','under_review','closed_without_quote') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `submission_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `client_insurance_service_request_number_idx` (`request_number`),
  KEY `client_insurance_service_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `client_vehicle_valuation_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `client_vehicle_valuation_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_year` int NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mileage` int DEFAULT NULL,
  `condition` enum('excellent','good','fair','poor') COLLATE utf8mb4_unicode_ci NOT NULL,
  `photo_urls_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_book_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','processing','complete','review_required','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `submission_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kinga_market_valuation_cents` int DEFAULT NULL,
  `valuation_provenance_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `client_valuation_request_number_idx` (`request_number`),
  KEY `client_valuation_token_idx` (`submission_token`),
  KEY `client_valuation_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commission_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `commission_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_id` int NOT NULL,
  `carrier_id` int NOT NULL,
  `product_id` int NOT NULL,
  `premium_amount` int NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `commission_amount` int NOT NULL,
  `commission_type` enum('new_business','renewal') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_status` enum('pending','paid','disputed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `payment_date` timestamp NULL DEFAULT NULL,
  `payment_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_period` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `component_benchmarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `component_benchmarks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `component_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `n` int NOT NULL,
  `p25` double NOT NULL,
  `median` double NOT NULL,
  `p75` double NOT NULL,
  `p95` double DEFAULT NULL,
  `min_cost` double DEFAULT NULL,
  `max_cost` double DEFAULT NULL,
  `confidence` enum('HIGH','MEDIUM','LOW') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'LOW',
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1.0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year_band` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_variant` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `market_region` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_quality` enum('verified','accepted_quote','assessor_validated','review_required') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'accepted_quote',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cb_component_make` (`component_id`,`vehicle_make`),
  KEY `idx_cb_component_id` (`component_id`),
  KEY `idx_cb_vehicle_precision` (`component_id`,`vehicle_make`,`vehicle_model`,`year_band`),
  KEY `idx_cb_market_currency` (`market_region`,`currency_code`,`evidence_quality`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=60001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `component_repair_outcomes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `component_repair_outcomes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessment_id` int NOT NULL,
  `component_name` varchar(120) NOT NULL,
  `component_category` varchar(60) DEFAULT NULL,
  `severity_at_decision` varchar(30) DEFAULT NULL,
  `vehicle_make` varchar(80) DEFAULT NULL,
  `vehicle_model` varchar(80) DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_age_years` int DEFAULT NULL,
  `outcome` enum('repair','replace','write_off') NOT NULL,
  `ai_suggestion` enum('repair','replace','uncertain') DEFAULT NULL,
  `was_override` tinyint NOT NULL DEFAULT '0',
  `adjuster_user_id` int DEFAULT NULL,
  `repair_cost_usd` decimal(10,2) DEFAULT NULL,
  `replace_cost_usd` decimal(10,2) DEFAULT NULL,
  `decided_at` varchar(50) NOT NULL,
  `created_at` varchar(50) NOT NULL,
  `part_origin` enum('oem','aftermarket','reconditioned','used','unknown') DEFAULT NULL,
  `repairer_name` varchar(255) DEFAULT NULL,
  `vehicle_variant` varchar(100) DEFAULT NULL,
  `vehicle_body_type` varchar(60) DEFAULT NULL,
  `market_region` varchar(20) DEFAULT NULL,
  `currency_code` varchar(10) DEFAULT NULL,
  `evidence_quality` enum('verified','accepted_quote','assessor_validated','review_required') NOT NULL DEFAULT 'accepted_quote',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cro_claim_id` (`claim_id`),
  KEY `idx_cro_component_severity` (`component_name`,`severity_at_decision`),
  KEY `idx_cro_make_model` (`vehicle_make`,`vehicle_model`),
  KEY `idx_cro_outcome` (`outcome`),
  KEY `idx_cro_vehicle_precision` (`component_name`,`vehicle_make`,`vehicle_model`,`vehicle_year`),
  KEY `idx_cro_market_currency` (`market_region`,`currency_code`,`evidence_quality`),
  CONSTRAINT `restore_fk_component_repair_outcomes_fk_component_repair_out` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=360001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cost_components`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_components` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `source_type` enum('panel_beater_quote','assessor_report','ai_estimate','final_approved') COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_id` int DEFAULT NULL,
  `labor_cost` decimal(12,2) DEFAULT '0.00',
  `parts_cost` decimal(12,2) DEFAULT '0.00',
  `paint_cost` decimal(12,2) DEFAULT '0.00',
  `materials_cost` decimal(12,2) DEFAULT '0.00',
  `sublet_cost` decimal(12,2) DEFAULT '0.00',
  `sundries` decimal(12,2) DEFAULT '0.00',
  `vat_amount` decimal(12,2) DEFAULT '0.00',
  `total_excl_vat` decimal(12,2) DEFAULT '0.00',
  `total_incl_vat` decimal(12,2) DEFAULT '0.00',
  `total_labor_hours` decimal(8,2) DEFAULT NULL,
  `average_labor_rate` decimal(10,2) DEFAULT NULL,
  `total_parts_count` int DEFAULT NULL,
  `oem_parts_count` int DEFAULT NULL,
  `aftermarket_parts_count` int DEFAULT NULL,
  `repair_vs_replace_ratio` decimal(5,2) DEFAULT NULL,
  `total_betterment` decimal(12,2) DEFAULT '0.00',
  `extraction_confidence` decimal(5,4) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cc_claim` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=210001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cost_learning_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cost_learning_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_descriptor` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `collision_direction` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `market_region` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DEFAULT',
  `case_signature` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_count` int NOT NULL DEFAULT '0',
  `structural_component_count` int NOT NULL DEFAULT '0',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `final_cost_usd_cents` int DEFAULT NULL,
  `cost_is_agreed` tinyint NOT NULL DEFAULT '0',
  `quote_coverage_ratio_pct` int NOT NULL DEFAULT '0',
  `high_cost_drivers_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_weighting_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_detail_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `quality_flags_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_variant` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_body_type` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_clr_claim_id` (`claim_id`),
  KEY `idx_clr_tenant_id` (`tenant_id`),
  KEY `idx_clr_case_signature` (`case_signature`),
  KEY `idx_clr_vehicle_descriptor` (`vehicle_descriptor`),
  KEY `idx_clr_collision_direction` (`collision_direction`),
  KEY `idx_clr_recorded_at` (`recorded_at`),
  KEY `idx_clr_vehicle_precision` (`vehicle_make`,`vehicle_model`,`vehicle_year`),
  KEY `idx_clr_market_currency` (`market_region`,`currency`),
  CONSTRAINT `restore_fk_cost_learning_records_fk_cost_learning_records_cl` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5880001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `country_repair_index`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `country_repair_index` (
  `id` int NOT NULL AUTO_INCREMENT,
  `country_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vat_rate` decimal(5,4) NOT NULL,
  `import_duty_rate` decimal(5,4) NOT NULL,
  `avg_labour_rate_per_hour` int NOT NULL,
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `effective_from` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_cri_country` (`country_code`),
  KEY `idx_cri_effective` (`effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cross_claim_signals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `cross_claim_signals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `signal_type` enum('repeat_damage_signal','driver_repeat_claim_signal','repairer_repeat_pattern_signal','vehicle_high_claim_frequency','damage_zone_repeat_signal','staged_accident_signal','repairer_driver_collusion_signal','claim_velocity_signal','total_loss_repeat_signal') COLLATE utf8mb4_unicode_ci NOT NULL,
  `signal_label` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `evidence_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `score_contribution` int NOT NULL DEFAULT '0',
  `is_dismissed` tinyint NOT NULL DEFAULT '0',
  `dismissed_by` int DEFAULT NULL,
  `dismissed_at` timestamp NULL DEFAULT NULL,
  `dismissal_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_ccs_claim_signal_unique` (`claim_id`,`signal_type`),
  KEY `idx_ccs_claim_id` (`claim_id`),
  KEY `idx_ccs_signal_type` (`signal_type`),
  KEY `idx_ccs_confidence` (`confidence`),
  KEY `idx_ccs_dismissed` (`is_dismissed`),
  KEY `idx_ccs_tenant` (`tenant_id`),
  CONSTRAINT `restore_fk_cross_claim_signals_fk_cross_claim_signals_claim_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=540001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `currency_exchange_rates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `currency_exchange_rates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `currency_code` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `currency_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rate_to_usd` decimal(18,6) NOT NULL,
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `currency_exchange_rates_currency_code_unique` (`currency_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_consent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_consent` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `consent_type` enum('data_processing','marketing','third_party_sharing','credit_check','automated_decision_making') COLLATE utf8mb4_unicode_ci NOT NULL,
  `consent_given` tinyint NOT NULL,
  `consent_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `withdrawn_date` timestamp NULL DEFAULT NULL,
  `consent_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `consent_version` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `customer_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `document_type` enum('id_document','drivers_license','proof_of_residence','vehicle_registration','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `verified_at` timestamp NULL DEFAULT NULL,
  `verified_by` int DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dataset_access_grants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dataset_access_grants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_scope` enum('tenant_private','tenant_feature','global_anonymized') COLLATE utf8mb4_unicode_ci NOT NULL,
  `granted_to_user_id` int DEFAULT NULL COMMENT 'User receiving access (NULL for role-based grants)',
  `granted_to_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Role receiving access',
  `granted_to_organization` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'External organization',
  `purpose` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Business justification for access',
  `expiry_date` date DEFAULT NULL COMMENT 'Access automatically revoked after this date',
  `max_records` int DEFAULT NULL COMMENT 'Maximum number of records that can be queried',
  `granted_by_user_id` int NOT NULL,
  `granted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revoked_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_dag_tenant_id` (`tenant_id`),
  KEY `idx_dag_data_scope` (`data_scope`),
  KEY `idx_dag_granted_to_user` (`granted_to_user_id`),
  KEY `idx_dag_expiry_date` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `decision_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `decision_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `snapshot_version` int NOT NULL DEFAULT '1',
  `created_at` bigint NOT NULL,
  `created_by_user_id` varchar(50) DEFAULT NULL,
  `verdict_decision` varchar(50) NOT NULL,
  `verdict_primary_reason` text NOT NULL,
  `verdict_confidence` int NOT NULL,
  `cost_ai_estimate` int NOT NULL,
  `cost_quoted` int NOT NULL DEFAULT '0',
  `cost_deviation_percent` int NOT NULL DEFAULT '0',
  `cost_fair_range_min` int NOT NULL,
  `cost_fair_range_max` int NOT NULL,
  `cost_verdict` varchar(20) NOT NULL,
  `fraud_score` int NOT NULL,
  `fraud_level` varchar(20) NOT NULL,
  `fraud_contributions_json` text NOT NULL,
  `physics_delta_v` int NOT NULL DEFAULT '0',
  `physics_velocity_range` varchar(50) NOT NULL DEFAULT '',
  `physics_energy_kj` int NOT NULL DEFAULT '0',
  `physics_force_kn` int NOT NULL DEFAULT '0',
  `physics_estimated` tinyint NOT NULL DEFAULT '0',
  `damage_zones_json` text NOT NULL,
  `damage_severity` varchar(30) NOT NULL,
  `damage_consistency_score` int NOT NULL DEFAULT '0',
  `enforcement_trace_json` text NOT NULL,
  `confidence_breakdown_json` text NOT NULL,
  `missing_fields_json` text NOT NULL,
  `estimated_fields_json` text NOT NULL,
  `extraction_confidence` int NOT NULL DEFAULT '0',
  `snapshot_json` longtext DEFAULT NULL COMMENT 'Verbatim spec-compliant JSON snapshot object',
  `lifecycle_state` varchar(20) NOT NULL DEFAULT 'DRAFT',
  `is_final_snapshot` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ds_claim` (`claim_id`),
  KEY `idx_ds_tenant` (`tenant_id`),
  KEY `idx_ds_created` (`created_at`),
  KEY `idx_ds_verdict` (`verdict_decision`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_naming_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_naming_templates` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `doc_type` enum('claim','assessment','report','approval') COLLATE utf8mb4_unicode_ci NOT NULL,
  `template` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `document_naming_templates_tenant_id_doc_type_unique` (`tenant_id`,`doc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_versions` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `document_name` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `doc_type` enum('claim','assessment','report','approval') COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL,
  `created_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `retention_until` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `document_versions_claim_id_doc_type_version_unique` (`claim_id`,`doc_type`,`version`),
  KEY `idx_document_versions_claim_id` (`claim_id`),
  KEY `idx_document_versions_tenant_id` (`tenant_id`),
  CONSTRAINT `restore_fk_document_versions_fk_document_versions_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `driver_claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_claims` (
  `id` int NOT NULL AUTO_INCREMENT,
  `driver_id` int NOT NULL,
  `claim_id` int NOT NULL,
  `role` enum('driver','claimant','passenger','third_party_driver','witness','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'driver',
  `is_at_fault` tinyint NOT NULL DEFAULT '0',
  `was_injured` tinyint NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_dc_driver_id` (`driver_id`),
  KEY `idx_dc_claim_id` (`claim_id`),
  KEY `idx_dc_role` (`role`),
  KEY `idx_dc_tenant` (`tenant_id`),
  UNIQUE KEY `idx_dc_unique` (`driver_id`,`claim_id`,`role`),
  CONSTRAINT `restore_fk_driver_claims_fk_driver_claims_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=390001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `driver_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `driver_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `id_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name_aliases` json DEFAULT NULL,
  `date_of_birth` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `nationality` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_class` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_issue_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_expiry_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `addresses` json DEFAULT NULL,
  `current_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_change_count` int DEFAULT '0',
  `phone_numbers` json DEFAULT NULL,
  `email_addresses` json DEFAULT NULL,
  `total_claims` int DEFAULT '0',
  `claims_as_claimant` int DEFAULT '0',
  `claims_as_driver` int DEFAULT '0',
  `claims_as_third_party` int DEFAULT '0',
  `first_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_claim_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_ids_json` json DEFAULT NULL,
  `insurer_ids_json` json DEFAULT NULL,
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `is_watchlisted` tinyint DEFAULT '0',
  `watchlist_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_dr_licence_number` (`licence_number`),
  KEY `idx_dr_full_name` (`full_name`),
  KEY `idx_dr_risk_score` (`risk_score`),
  KEY `idx_dr_total_claims` (`total_claims`),
  KEY `idx_dr_tenant` (`tenant_id`),
  KEY `idx_dr_watchlisted` (`is_watchlisted`),
  KEY `idx_driver_registry_tenant` (`tenant_id`),
  KEY `idx_driver_registry_licence` (`licence_number`),
  KEY `idx_driver_registry_claims` (`total_claims`),
  KEY `idx_driver_registry_watchlist` (`is_watchlisted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=810001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `drivers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `drivers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_issue_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_expiry_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `national_id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_country` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_claims_count` int NOT NULL DEFAULT '0',
  `at_fault_claims_count` int NOT NULL DEFAULT '0',
  `driver_risk_score` int NOT NULL DEFAULT '0',
  `is_repeat_claimer` tinyint NOT NULL DEFAULT '0',
  `is_staged_accident_suspect` tinyint NOT NULL DEFAULT '0',
  `claim_ids_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_fraud_risk_score` int NOT NULL DEFAULT '0',
  `data_source` enum('ocr','manual','import','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `ocr_confidence_score` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_drivers_license_number` (`license_number`),
  KEY `idx_drivers_full_name` (`full_name`),
  KEY `idx_drivers_email` (`email`),
  KEY `idx_drivers_phone` (`phone`),
  KEY `idx_drivers_national_id` (`national_id_number`),
  KEY `idx_drivers_tenant` (`tenant_id`),
  KEY `idx_drivers_risk_score` (`driver_risk_score`),
  KEY `idx_drivers_repeat_claimer` (`is_repeat_claimer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=390001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_verification_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verification_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('verification','password_reset') COLLATE utf8mb4_unicode_ci NOT NULL,
  `used` tinyint NOT NULL DEFAULT '0',
  `used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineer_observations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineer_observations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inspection_id` int NOT NULL,
  `observation_type` enum('defect','hazard','compliance','maintenance','recommendation','general_note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general_note',
  `observation_mode` enum('structured','free_text','voice') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free_text',
  `component` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition_detail` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observation_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voice_audio_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `voice_transcript` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transcription_language` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'en',
  `severity` enum('info','minor','moderate','major','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'info',
  `recommendation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_body` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_clause` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_measurement_ids` json DEFAULT NULL,
  `linked_evidence_ids` json DEFAULT NULL,
  `ai_draft_used` tinyint NOT NULL DEFAULT '0',
  `ai_draft_approved` tinyint NOT NULL DEFAULT '0',
  `ai_draft_prompt` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `authored_by` int NOT NULL,
  `authored_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_eo_inspection` (`inspection_id`),
  KEY `idx_eo_tenant` (`tenant_id`),
  KEY `idx_eo_type` (`observation_type`),
  KEY `idx_eo_severity` (`severity`),
  KEY `idx_eo_authored_by` (`authored_by`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `engineer_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `engineer_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `skills` json DEFAULT NULL,
  `certifications` json DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region_lat` decimal(10,7) DEFAULT NULL,
  `region_lng` decimal(10,7) DEFAULT NULL,
  `max_travel_radius_km` int DEFAULT '100',
  `is_available` tinyint NOT NULL DEFAULT '1',
  `availability_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active_inspections` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idx_ep_user_id` (`user_id`),
  KEY `idx_ep_tenant` (`tenant_id`),
  KEY `idx_ep_region` (`region`),
  KEY `idx_ep_available` (`is_available`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2280001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `entity_relationship_graph`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `entity_relationship_graph` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `entity_a_type` enum('driver','claimant','assessor','panel_beater','police_officer','fleet') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_a_id` int NOT NULL,
  `relationship_type` enum('claimant_filed','driver_involved','assessed_by','repaired_by','attended_by','assessor_routed_to','officer_attended_claimant','officer_attended_assessor','driver_is_claimant','driver_differs_from_claimant','fleet_vehicle_involved') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_b_type` enum('driver','claimant','assessor','panel_beater','police_officer','fleet') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_b_id` int NOT NULL,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `edge_weight` int DEFAULT '1',
  `first_seen_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_seen_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_erg_entity_a` (`entity_a_type`,`entity_a_id`),
  KEY `idx_erg_entity_b` (`entity_b_type`,`entity_b_id`),
  KEY `idx_erg_relationship` (`relationship_type`),
  KEY `idx_erg_claim_id` (`claim_id`),
  KEY `idx_erg_tenant` (`tenant_id`),
  KEY `idx_erg_edge_weight` (`edge_weight`),
  KEY `idx_entity_rel_weight` (`edge_weight`),
  KEY `idx_entity_rel_a_id` (`entity_a_id`),
  KEY `idx_entity_rel_b_id` (`entity_b_id`),
  KEY `idx_entity_rel_claim` (`claim_id`),
  CONSTRAINT `restore_fk_entity_relationship_graph_fk_entity_relationship_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=510001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `entity_relationships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `entity_relationships` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entity_a_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_a_id` int NOT NULL,
  `entity_a_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_b_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_b_id` int NOT NULL,
  `entity_b_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relationship_type` enum('shared_address','shared_phone','shared_email','shared_bank_account','family_relation','business_relation','frequent_interaction','social_media_connection','employment_relation','suspicious_pattern') COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_strength` int DEFAULT '0',
  `interaction_count` int DEFAULT '0',
  `first_interaction_date` timestamp NULL DEFAULT NULL,
  `last_interaction_date` timestamp NULL DEFAULT NULL,
  `is_collusion_suspected` tinyint DEFAULT '0',
  `collusion_score` int DEFAULT '0',
  `collusion_evidence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `investigation_status` enum('none','pending','in_progress','confirmed','cleared') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `investigation_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `extracted_document_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `extracted_document_data` (
  `id` int NOT NULL AUTO_INCREMENT,
  `document_id` int NOT NULL,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_date` date DEFAULT NULL,
  `incident_time` time DEFAULT NULL,
  `incident_location` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_license_plate` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_mass` int DEFAULT NULL,
  `repair_cost_estimate` decimal(10,2) DEFAULT NULL,
  `repair_parts_list` json DEFAULT NULL,
  `repair_labor_hours` decimal(6,2) DEFAULT NULL,
  `repair_labor_rate` decimal(10,2) DEFAULT NULL,
  `assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_observations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_severity` enum('minor','moderate','severe','total_loss') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extraction_confidence` decimal(5,4) DEFAULT NULL,
  `fields_extracted_count` int DEFAULT NULL,
  `fields_missing_count` int DEFAULT NULL,
  `full_text` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `extracted_repair_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `extracted_repair_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `document_id` int DEFAULT NULL,
  `source_type` enum('panel_beater_quote','assessor_report','ai_estimate') COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_number` int DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` enum('parts','labor','paint','diagnostic','sundries','sublet','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `damage_location` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `repair_action` enum('repair','replace','refinish','blend','remove_refit') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(10,2) DEFAULT '1.00',
  `unit_price` decimal(10,2) DEFAULT NULL,
  `line_total` decimal(10,2) DEFAULT NULL,
  `labor_hours` decimal(6,2) DEFAULT NULL,
  `labor_rate` decimal(10,2) DEFAULT NULL,
  `parts_quality` enum('oem','genuine','aftermarket','used','reconditioned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `betterment_percent` decimal(5,2) DEFAULT NULL,
  `betterment_amount` decimal(10,2) DEFAULT NULL,
  `extraction_confidence` decimal(5,4) DEFAULT NULL,
  `is_handwritten` tinyint DEFAULT '0',
  `manually_verified` tinyint DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_eri_claim` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fast_track_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fast_track_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_id` int DEFAULT NULL,
  `claim_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fast_track_action` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_confidence_score` decimal(5,2) NOT NULL,
  `max_claim_value` int NOT NULL,
  `max_fraud_score` decimal(5,2) NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT '1',
  `version` int NOT NULL,
  `effective_from` timestamp NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ft_config_tenant` (`tenant_id`),
  KEY `idx_ft_config_product` (`product_id`),
  KEY `idx_ft_config_claim_type` (`claim_type`),
  KEY `idx_ft_config_enabled` (`enabled`),
  KEY `idx_ft_config_effective` (`effective_from`),
  KEY `idx_ft_config_hierarchy` (`tenant_id`,`product_id`,`claim_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=9030001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fast_track_routing_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fast_track_routing_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_id` int DEFAULT NULL,
  `config_version` int DEFAULT NULL,
  `eligible` tinyint NOT NULL,
  `decision` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT','MANUAL_REVIEW') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence_score` decimal(5,2) NOT NULL,
  `claim_value` int DEFAULT NULL,
  `fraud_score` decimal(5,2) NOT NULL,
  `claim_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_id` int DEFAULT NULL,
  `override` tinyint NOT NULL DEFAULT '0',
  `override_by` int DEFAULT NULL,
  `override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evaluated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ft_log_claim` (`claim_id`),
  KEY `idx_ft_log_tenant` (`tenant_id`),
  KEY `idx_ft_log_config` (`config_id`),
  KEY `idx_ft_log_decision` (`decision`),
  KEY `idx_ft_log_evaluated` (`evaluated_at`),
  KEY `idx_ft_log_claim_tenant` (`claim_id`,`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=9090001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `federated_learning_metadata`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `federated_learning_metadata` (
  `id` int NOT NULL AUTO_INCREMENT,
  `round_number` int NOT NULL,
  `model_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'fraud_detection, cost_estimation, etc.',
  `participant_count` int NOT NULL,
  `participant_tenant_ids` json DEFAULT NULL COMMENT 'Array of tenant_ids (encrypted or hashed)',
  `global_model_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `local_model_contributions` json DEFAULT NULL COMMENT 'Array of {tenant_id_hash, gradient_norm, data_count}',
  `aggregation_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'federated_averaging',
  `global_model_accuracy` decimal(5,4) DEFAULT NULL COMMENT 'Accuracy on global test set',
  `convergence_status` enum('converging','converged','diverged') COLLATE utf8mb4_unicode_ci DEFAULT 'converging',
  `training_started_at` timestamp NOT NULL,
  `training_completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_flm_round_number` (`round_number`),
  KEY `idx_flm_model_type` (`model_type`),
  KEY `idx_flm_training_started` (`training_started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `final_approval_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `final_approval_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `final_decision` enum('approved_repair','approved_total_loss','cash_settlement','rejected','withdrawn') COLLATE utf8mb4_unicode_ci NOT NULL,
  `final_approved_amount` decimal(12,2) NOT NULL,
  `final_labor_cost` decimal(12,2) DEFAULT NULL,
  `final_parts_cost` decimal(12,2) DEFAULT NULL,
  `final_paint_cost` decimal(12,2) DEFAULT NULL,
  `final_sublet_cost` decimal(12,2) DEFAULT NULL,
  `final_betterment` decimal(12,2) DEFAULT NULL,
  `approved_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_by_role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approval_date` date DEFAULT NULL,
  `assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_estimate` decimal(12,2) DEFAULT NULL,
  `repair_shop_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actual_repair_duration` int DEFAULT NULL,
  `customer_satisfaction` int DEFAULT NULL,
  `approval_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `conditions_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `data_source` enum('extracted_from_document','manual_entry','system_import') COLLATE utf8mb4_unicode_ci NOT NULL,
  `captured_by_user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `historical_claim_id` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_user_id` int NOT NULL,
  `account_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_insurer_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linked_agency_id` int DEFAULT NULL,
  `status` enum('active','suspended','pending') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `subscription_tier` enum('free','starter','professional','enterprise') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'free',
  `vehicle_count` int NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `verification_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `verified_by_user_id` int DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fleet_accounts_owner` (`owner_user_id`),
  KEY `idx_fleet_accounts_insurer` (`linked_insurer_tenant_id`),
  KEY `idx_fleet_accounts_agency` (`linked_agency_id`),
  KEY `idx_fleet_accounts_status` (`status`),
  UNIQUE KEY `account_code` (`account_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` enum('fleet','vehicle','maintenance','service_request','quote','document') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `action` enum('create','update','delete','view','export') COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `user_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changes_before` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changes_after` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fleet_id` int DEFAULT NULL,
  `vehicle_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_type` enum('registration_book','ownership_certificate','inspection_report','insurance_policy','service_history','photo','valuation_report','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','verified','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `verified_by` int DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_drivers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_drivers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fleet_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `driver_license_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_expiry` date NOT NULL,
  `license_class` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hire_date` date NOT NULL,
  `employment_status` enum('active','suspended','terminated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `termination_date` date DEFAULT NULL,
  `emergency_contact_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emergency_contact_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fleet_drivers_tenant_id` (`tenant_id`),
  KEY `idx_fleet_drivers_fleet_id` (`fleet_id`),
  KEY `idx_fleet_drivers_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2190001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_incident_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_incident_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `driver_id` int NOT NULL,
  `fleet_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `incident_date` timestamp NOT NULL,
  `location` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('minor','moderate','major','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'minor',
  `status` enum('submitted','under_review','approved','rejected','claim_filed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `police_report_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_damage` decimal(10,2) DEFAULT NULL,
  `vehicle_driveable` tinyint DEFAULT '1',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `review_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fleet_incident_reports_tenant_id` (`tenant_id`),
  KEY `idx_fleet_incident_reports_fleet_id` (`fleet_id`),
  KEY `idx_fleet_incident_reports_vehicle_id` (`vehicle_id`),
  KEY `idx_fleet_incident_reports_driver_id` (`driver_id`),
  KEY `idx_fleet_incident_reports_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_intelligence_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_intelligence_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fleet_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `intelligence_json` json NOT NULL,
  `fleet_risk_score` int NOT NULL DEFAULT '0',
  `fleet_risk_tier` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low',
  `computed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fis_fleet_id` (`fleet_id`),
  KEY `idx_fis_tenant` (`tenant_id`),
  KEY `idx_fis_risk_tier` (`fleet_risk_tier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_manager_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_manager_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `fleet_account_id` int DEFAULT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_reg` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `job_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `review_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fmr_user_id` (`user_id`),
  KEY `idx_fmr_fleet_account_id` (`fleet_account_id`),
  KEY `idx_fmr_status` (`status`),
  KEY `idx_fmr_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `industry` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fleet_size` int DEFAULT NULL,
  `total_claims` int DEFAULT '0',
  `claims_by_hour` json DEFAULT NULL,
  `claims_by_day_of_week` json DEFAULT NULL,
  `claims_by_month` json DEFAULT NULL,
  `night_claim_pct` decimal(5,2) DEFAULT NULL,
  `weekend_claim_pct` decimal(5,2) DEFAULT NULL,
  `peak_accident_hour` int DEFAULT NULL,
  `incident_locations` json DEFAULT NULL,
  `location_concentration_score` int DEFAULT '0',
  `repeat_driver_ids` json DEFAULT NULL,
  `repeat_location_claims` int DEFAULT '0',
  `avg_claim_value_cents` int DEFAULT NULL,
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fr_company_name` (`company_name`),
  KEY `idx_fr_risk_score` (`risk_score`),
  KEY `idx_fr_night_claim_pct` (`night_claim_pct`),
  KEY `idx_fr_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_rfq_client_instructions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_rfq_client_instructions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_request_id` int NOT NULL,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fleet_account_id` int NOT NULL,
  `instruction` enum('accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('requested','executed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `instructed_by` int NOT NULL,
  `executed_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `executed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_fleet_rfq_client_instruction` (`quote_request_id`),
  KEY `idx_fleet_rfq_instruction_agency_status` (`agency_tenant_id`,`status`),
  KEY `idx_fleet_rfq_instruction_fleet` (`fleet_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_risk_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_risk_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `fleet_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overall_risk_score` int NOT NULL,
  `maintenance_risk` int DEFAULT NULL,
  `claims_risk` int DEFAULT NULL,
  `vehicle_age_risk` int DEFAULT NULL,
  `usage_risk` int DEFAULT NULL,
  `repair_cost_risk` int DEFAULT NULL,
  `risk_factors` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `premium_impact` enum('decrease','neutral','increase') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recommended_premium_adjustment` decimal(5,2) DEFAULT NULL,
  `calculated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_review_date` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `fleet_risk_scores_vehicle_id_unique` (`vehicle_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleet_vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleet_vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vin` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year` int NOT NULL,
  `color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `engine_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chassis_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_valuation` int DEFAULT NULL,
  `valuation_date` timestamp NULL DEFAULT NULL,
  `valuation_source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_score` int DEFAULT NULL,
  `risk_score` int DEFAULT NULL,
  `claims_history_count` int DEFAULT '0',
  `owner_id` int NOT NULL,
  `vehicle_images` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_book_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_book_s3_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `fleet_id` int DEFAULT NULL,
  `engine_capacity` int DEFAULT NULL,
  `vehicle_mass` int DEFAULT NULL,
  `fuel_type` enum('petrol','diesel','electric','hybrid') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transmission_type` enum('manual','automatic') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `usage_type` enum('private','commercial','logistics','mining','agriculture','public_transport') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_use` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `average_monthly_mileage` int DEFAULT NULL,
  `current_insurer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_start_date` timestamp NULL DEFAULT NULL,
  `policy_end_date` timestamp NULL DEFAULT NULL,
  `coverage_type` enum('comprehensive','third_party','third_party_fire_theft') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchase_price` int DEFAULT NULL,
  `purchase_date` timestamp NULL DEFAULT NULL,
  `replacement_value` int DEFAULT NULL,
  `status` enum('active','inactive','sold','written_off','under_repair') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `last_inspection_date` timestamp NULL DEFAULT NULL,
  `next_inspection_due` timestamp NULL DEFAULT NULL,
  `maintenance_compliance_score` int DEFAULT NULL,
  `vehicle_origin` enum('Local_Assembly','Ex_Japanese','Ex_European','Ex_American','Ex_Chinese','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `imported_from` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `import_year` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `fleet_vehicles_vin_unique` (`vin`),
  UNIQUE KEY `fleet_vehicles_registration_number_unique` (`registration_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2280001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fleets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fleets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fleet_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fleet_type` enum('mining','logistics','corporate','rental','public_transport','agriculture','construction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_vehicles` int DEFAULT '0',
  `active_vehicles` int DEFAULT '0',
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `preferred_insurer_id` int DEFAULT NULL COMMENT 'Link to tenants table if insurer is on KINGA',
  `preferred_insurer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Insurer name (whether on KINGA or not)',
  `preferred_insurer_contact` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Contact email/phone',
  `insurer_is_on_kinga` tinyint NOT NULL DEFAULT '0' COMMENT 'Flag to indicate if insurer uses KINGA',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2250001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fraud_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `alert_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alert_severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL,
  `alert_title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alert_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `triggered_rule_id` int DEFAULT NULL,
  `triggered_rule_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_entity_id` int DEFAULT NULL,
  `alert_data` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_score` int DEFAULT NULL,
  `status` enum('new','acknowledged','investigating','resolved','false_alarm') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'new',
  `assigned_to` int DEFAULT NULL,
  `resolution_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution_date` timestamp NULL DEFAULT NULL,
  `is_fraud_confirmed` tinyint DEFAULT NULL,
  `actions_taken` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_fraud_alerts_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_fraud_alerts_fk_fraud_alerts_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=540001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fraud_indicators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_indicators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `overall_fraud_score` int NOT NULL,
  `fraud_risk_level` enum('low','medium','moderate','high','critical','elevated') COLLATE utf8mb4_unicode_ci NOT NULL,
  `delayed_submission_days` int DEFAULT NULL,
  `delayed_submission_score` int DEFAULT NULL,
  `is_non_owner_driver` tinyint DEFAULT '0',
  `non_owner_driver_score` int DEFAULT NULL,
  `is_sole_party_night_accident` tinyint DEFAULT '0',
  `sole_party_night_score` int DEFAULT NULL,
  `policy_age_days` int DEFAULT NULL,
  `new_policy_write_off_score` int DEFAULT NULL,
  `previous_insurer_count` int DEFAULT NULL,
  `insurer_hopping_score` int DEFAULT NULL,
  `claimant_history_score` int DEFAULT NULL,
  `quote_similarity_score` int DEFAULT NULL,
  `has_copy_quotations` tinyint DEFAULT '0',
  `inflated_parts_cost_score` int DEFAULT NULL,
  `inflated_labor_time_score` int DEFAULT NULL,
  `exaggerated_damage_score` int DEFAULT NULL,
  `replacement_vs_repair_ratio` int DEFAULT NULL,
  `replacement_ratio_score` int DEFAULT NULL,
  `damage_scope_creep_score` int DEFAULT NULL,
  `assessor_collusion_score` int DEFAULT NULL,
  `assessor_bias_score` int DEFAULT NULL,
  `rubber_stamping_score` int DEFAULT NULL,
  `photo_metadata_score` int DEFAULT NULL,
  `reused_photo_score` int DEFAULT NULL,
  `document_consistency_score` int DEFAULT NULL,
  `staged_accident_score` int DEFAULT NULL,
  `geographic_risk_score` int DEFAULT NULL,
  `temporal_anomaly_score` int DEFAULT NULL,
  `detected_patterns` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_evidence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requires_investigation` tinyint NOT NULL DEFAULT '0',
  `investigation_priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `investigation_status` enum('pending','in_progress','completed','closed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `investigation_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_fraud_indicators_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_fraud_indicators_fk_fraud_indicators_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fraud_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fraud_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rule_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rule_category` enum('claimant','panel_beater','assessor','vehicle','document','temporal','geographic','network') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL,
  `score_weight` int NOT NULL DEFAULT '10',
  `threshold_value` int DEFAULT NULL,
  `threshold_unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rule_logic` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auto_flag` tinyint DEFAULT '1',
  `requires_manual_review` tinyint DEFAULT '0',
  `notify_investigator` tinyint DEFAULT '0',
  `times_triggered` int DEFAULT '0',
  `true_positive_count` int DEFAULT '0',
  `false_positive_count` int DEFAULT '0',
  `accuracy` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `rule_name` (`rule_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `fuel_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `fuel_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fleet_account_id` int NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fuel_date` timestamp NOT NULL,
  `litres` decimal(8,2) NOT NULL,
  `cost_per_litre` decimal(8,4) DEFAULT NULL,
  `total_cost_cents` int NOT NULL,
  `odometer` int DEFAULT NULL,
  `fuel_type` enum('petrol','diesel','electric','hybrid','lpg') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'petrol',
  `filled_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_fuel_fleet` (`fleet_account_id`),
  KEY `idx_fuel_vehicle` (`vehicle_registration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `generated_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `generated_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `claim_id` int DEFAULT NULL,
  `report_type` enum('claims_assessment','portfolio_summary','fraud_intelligence','executive_summary','risk_portfolio','processor_performance','assessor_performance','panel_beater_performance') COLLATE utf8mb4_unicode_ci NOT NULL,
  `tier` enum('process','protect','prove') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'process',
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generated_by_user_id` int NOT NULL,
  `generated_at` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size_bytes` int DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `status` enum('generating','ready','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ready',
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gr_tenant_id` (`tenant_id`),
  KEY `idx_gr_claim_id` (`claim_id`),
  KEY `idx_gr_report_type` (`report_type`),
  KEY `idx_gr_generated_by` (`generated_by_user_id`),
  KEY `idx_gr_created_at` (`created_at`),
  CONSTRAINT `restore_fk_generated_reports_fk_generated_reports_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `geometry_sources`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `geometry_sources` (
  `id` int NOT NULL AUTO_INCREMENT,
  `measurement_id` int DEFAULT NULL,
  `landmark_id` int DEFAULT NULL,
  `source_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_added` timestamp DEFAULT CURRENT_TIMESTAMP,
  `validation_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `global_anonymized_dataset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `global_anonymized_dataset` (
  `id` int NOT NULL AUTO_INCREMENT,
  `anonymous_record_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID to prevent correlation',
  `capture_month` varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'YYYY-MM format (temporal generalization)',
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year_bracket` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '5-year brackets: 2020-2024, 2015-2019, etc.',
  `vehicle_mass` int DEFAULT NULL,
  `accident_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Generalized from city',
  `detected_damage_components` json DEFAULT NULL,
  `damage_severity_scores` json DEFAULT NULL,
  `physics_plausibility_score` int DEFAULT NULL,
  `ai_estimated_cost` int DEFAULT NULL,
  `assessor_adjusted_cost` int DEFAULT NULL,
  `insurer_approved_cost` int DEFAULT NULL,
  `cost_variance_ai_vs_assessor` int DEFAULT NULL,
  `cost_variance_assessor_vs_final` int DEFAULT NULL,
  `cost_variance_ai_vs_final` int DEFAULT NULL,
  `ai_fraud_score` int DEFAULT NULL,
  `final_fraud_outcome` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_tier` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessment_turnaround_hours` decimal(10,2) DEFAULT NULL,
  `reassignment_count` int DEFAULT NULL,
  `approval_timeline_hours` decimal(10,2) DEFAULT NULL,
  `anonymized_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `schema_version` int NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `anonymous_record_id` (`anonymous_record_id`),
  KEY `idx_gad_capture_month` (`capture_month`),
  KEY `idx_gad_vehicle_make` (`vehicle_make`),
  KEY `idx_gad_province` (`province`),
  KEY `idx_gad_accident_type` (`accident_type`),
  KEY `idx_gad_anonymized_at` (`anonymized_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `global_search_analytics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `global_search_analytics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `query` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result_count` int NOT NULL DEFAULT '0',
  `clicked_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `clicked_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `searched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gsa_tenant_id` (`tenant_id`),
  KEY `idx_gsa_searched_at` (`searched_at`),
  KEY `idx_gsa_query` (`query`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `global_search_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `global_search_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `query` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `result_count` int NOT NULL DEFAULT '0',
  `searched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gsh_user_id` (`user_id`),
  KEY `idx_gsh_tenant_id` (`tenant_id`),
  KEY `idx_gsh_searched_at` (`searched_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `governance_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `governance_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `performed_by` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `performed_by_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp_ms` bigint NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `override_flag` tinyint NOT NULL DEFAULT '0',
  `ai_decision` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `human_decision` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action_allowed` tinyint NOT NULL DEFAULT '1',
  `validation_errors_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gal_claim` (`claim_id`),
  KEY `idx_gal_tenant` (`tenant_id`),
  KEY `idx_gal_action` (`action`),
  KEY `idx_gal_timestamp` (`timestamp_ms`),
  KEY `idx_gal_override` (`override_flag`),
  CONSTRAINT `restore_fk_governance_audit_log_fk_governance_audit_log_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `governance_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `governance_notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('intake_escalation','auto_assignment','ai_rerun','executive_override','segregation_violation') COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `recipients` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_recipients` (`recipients`(255)),
  KEY `idx_read_at` (`read_at`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `restore_fk_governance_notifications_fk_governance_notificati` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5520001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `governance_violation_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `governance_violation_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `violation_type` enum('EXCEEDS_AUTO_APPROVAL_LIMIT','BELOW_MIN_CONFIDENCE','EXCEEDS_MAX_FRAUD_TOLERANCE','MISSING_JUSTIFICATION','INSUFFICIENT_JUSTIFICATION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `attempted_config` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `governance_limits_version` int NOT NULL,
  `governance_limits_snapshot` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `violated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gov_violation_tenant` (`tenant_id`),
  KEY `idx_gov_violation_user` (`user_id`),
  KEY `idx_gov_violation_type` (`violation_type`),
  KEY `idx_gov_violation_at` (`violated_at`),
  KEY `idx_gov_violation_tenant_time` (`tenant_id`,`violated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=3030001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `historical_claims`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `historical_claims` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` int DEFAULT NULL,
  `claim_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_date` date DEFAULT NULL,
  `incident_location` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incident_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_speed` int DEFAULT NULL,
  `claimant_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claimant_contact` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_panel_beater_quote` decimal(12,2) DEFAULT NULL,
  `total_assessor_estimate` decimal(12,2) DEFAULT NULL,
  `total_ai_estimate` decimal(12,2) DEFAULT NULL,
  `final_approved_cost` decimal(12,2) DEFAULT NULL,
  `repair_decision` enum('repair','total_loss','cash_settlement','rejected') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pipeline_status` enum('pending','documents_uploaded','classification_complete','extraction_complete','ground_truth_captured','variance_calculated','complete','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `data_quality_score` int DEFAULT NULL,
  `fields_extracted` int DEFAULT NULL,
  `fields_missing` int DEFAULT NULL,
  `manual_corrections` int DEFAULT '0',
  `total_documents` int DEFAULT '0',
  `extraction_log` json DEFAULT NULL,
  `last_error` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `retry_count` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `replay_mode` tinyint NOT NULL DEFAULT '0' COMMENT '0 = normal, 1 = replay enabled',
  `last_replayed_at` timestamp NULL DEFAULT NULL COMMENT 'When this claim was last replayed',
  `replay_count` int NOT NULL DEFAULT '0' COMMENT 'Number of times replayed',
  `damage_photos_json` json DEFAULT NULL COMMENT 'Array of S3 URLs to extracted damage photos',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_hc_tenant` (`tenant_id`),
  KEY `idx_hc_batch` (`batch_id`),
  KEY `idx_hc_status` (`pipeline_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=6330001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `historical_replay_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `historical_replay_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `historical_claim_id` int NOT NULL,
  `original_claim_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `replayed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `replayed_by_user_id` int DEFAULT NULL,
  `replay_version` int DEFAULT '1',
  `policy_version_id` int DEFAULT NULL,
  `policy_version` int DEFAULT NULL,
  `policy_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `original_decision` enum('approved','rejected','referred','total_loss','cash_settlement') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `original_payout` decimal(12,2) DEFAULT NULL,
  `original_processing_time_hours` decimal(10,2) DEFAULT NULL,
  `original_assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_damage_detection_score` decimal(5,2) DEFAULT NULL,
  `ai_estimated_cost` decimal(12,2) DEFAULT NULL,
  `ai_fraud_score` decimal(5,2) DEFAULT NULL,
  `ai_confidence_score` decimal(5,2) DEFAULT NULL,
  `kinga_routing_decision` enum('auto_approve','hybrid_review','escalate','fraud_review') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kinga_predicted_payout` decimal(12,2) DEFAULT NULL,
  `kinga_estimated_processing_time_hours` decimal(10,2) DEFAULT NULL,
  `decision_match` tinyint NOT NULL,
  `payout_variance` decimal(12,2) DEFAULT NULL,
  `payout_variance_percentage` decimal(5,2) DEFAULT NULL,
  `processing_time_delta` decimal(10,2) DEFAULT NULL,
  `processing_time_delta_percentage` decimal(5,2) DEFAULT NULL,
  `confidence_level` enum('very_high','high','medium','low','very_low') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence_justification` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_risk_level` enum('none','low','medium','moderate','high','critical','elevated') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_indicators` json DEFAULT NULL,
  `simulated_workflow_steps` json DEFAULT NULL,
  `is_replay` tinyint NOT NULL DEFAULT '1',
  `no_live_mutation` tinyint NOT NULL DEFAULT '1',
  `performance_summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recommended_action` enum('adopt_kinga','review_policy','manual_review','no_action') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `replay_duration_ms` int DEFAULT NULL,
  `replay_status` enum('success','partial_success','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'success',
  `replay_errors` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_historical_replay_results_tenant_id` (`tenant_id`),
  KEY `idx_historical_replay_results_historical_claim_id` (`historical_claim_id`),
  KEY `idx_historical_replay_results_replayed_at` (`replayed_at`),
  KEY `idx_historical_replay_results_policy_version_id` (`policy_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `human_review_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `human_review_queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `historical_claim_id` int NOT NULL,
  `review_priority` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `review_status` enum('pending','in_review','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `flagged_issues` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewer_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_hrq_tenant_id` (`tenant_id`),
  KEY `idx_hrq_historical_claim_id` (`historical_claim_id`),
  KEY `idx_hrq_review_status` (`review_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ingestion_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ingestion_batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ingestion_source` enum('processor_upload','bulk_batch','api','email','legacy_import','broker_upload') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ingestion_channel` enum('web_ui','api','email','sftp') COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploaded_by_user_id` int DEFAULT NULL,
  `uploaded_by_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by_ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_documents` int NOT NULL DEFAULT '0',
  `processed_documents` int NOT NULL DEFAULT '0',
  `failed_documents` int NOT NULL DEFAULT '0',
  `status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `custody_chain` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5100001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ingestion_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ingestion_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` int NOT NULL,
  `document_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_filename` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size_bytes` int NOT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_bucket` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_key` varchar(1024) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_url` varchar(2048) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sha256_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hash_verified` tinyint NOT NULL DEFAULT '0',
  `document_type` enum('claim_form','police_report','damage_image','repair_quote','assessor_report','supporting_evidence','unknown') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `classification_confidence` decimal(5,4) DEFAULT NULL,
  `classification_method` enum('ai_model','rule_based','manual_override') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extraction_status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `extraction_started_at` timestamp NULL DEFAULT NULL,
  `extraction_completed_at` timestamp NULL DEFAULT NULL,
  `validation_status` enum('pending','in_review','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `validated_by_user_id` int DEFAULT NULL,
  `validated_at` timestamp NULL DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `language_detected` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `historical_claim_id` int DEFAULT NULL,
  `p_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '64-char binary string perceptual hash (8x8 thumbnail hash). NULL for non-image documents.',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `document_id` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5070001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspection_projects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_projects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_ref` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_status` enum('active','completed','on_hold','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `start_date` timestamp NULL DEFAULT NULL,
  `target_end_date` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `total_inspections` int NOT NULL DEFAULT '0',
  `completed_inspections` int NOT NULL DEFAULT '0',
  `lead_engineer_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_proj_ref` (`project_ref`),
  KEY `idx_proj_tenant` (`tenant_id`),
  KEY `idx_proj_status` (`project_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `inspections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inspection_ref` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inspection_type` enum('vehicle','engineering','risk_survey','fleet','property','equipment','industrial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('scheduled','assigned','in_progress','evidence_capture','measurements_complete','observations_complete','ai_analysis','engineer_review','physics_reconciliation','report_generation','complete','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled',
  `asset_registry_id` int DEFAULT NULL,
  `asset_ref` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `asset_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_id` int DEFAULT NULL,
  `project_id` int DEFAULT NULL,
  `assigned_engineer_id` int DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT NULL,
  `scheduled_date` timestamp NULL DEFAULT NULL,
  `location_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_lat` decimal(10,7) DEFAULT NULL,
  `location_lng` decimal(10,7) DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `ai_analysis_json` json DEFAULT NULL,
  `ai_analysis_at` timestamp NULL DEFAULT NULL,
  `ai_analysis_approved` tinyint NOT NULL DEFAULT '0',
  `physics_reconciled` tinyint NOT NULL DEFAULT '0',
  `physics_reconciled_at` timestamp NULL DEFAULT NULL,
  `reconciliation_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `idx_inspections_ref` (`inspection_ref`),
  KEY `idx_inspections_tenant` (`tenant_id`),
  KEY `idx_inspections_claim` (`claim_id`),
  KEY `idx_inspections_engineer` (`assigned_engineer_id`),
  KEY `idx_inspections_asset` (`asset_registry_id`),
  KEY `idx_inspections_vehicle` (`vehicle_registration`),
  KEY `idx_inspections_status` (`status`),
  PRIMARY KEY (`id`) /*T![clustered_index] NONCLUSTERED */,
  KEY `idx_inspections_project` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2430001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurance_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurance_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` int NOT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `changes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1200001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurance_carriers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurance_carriers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `short_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `default_commission_rate` decimal(5,2) NOT NULL,
  `api_endpoint` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_credentials` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_enabled` tinyint DEFAULT '0',
  `contact_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `insurance_carriers_short_code_unique` (`short_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurance_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurance_policies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quote_id` int DEFAULT NULL,
  `customer_id` int NOT NULL,
  `vehicle_id` int NOT NULL,
  `carrier_id` int NOT NULL,
  `product_id` int NOT NULL,
  `premium_amount` int NOT NULL,
  `premium_frequency` enum('monthly','annual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `excess_amount` int DEFAULT NULL,
  `coverage_start_date` timestamp NOT NULL,
  `coverage_end_date` timestamp NOT NULL,
  `coverage_limits` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','active','endorsed','cancelled','expired','renewed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `cancellation_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cancellation_date` timestamp NULL DEFAULT NULL,
  `cancelled_by` int DEFAULT NULL,
  `renewal_reminder_sent` tinyint DEFAULT '0',
  `renewal_reminder_date` timestamp NULL DEFAULT NULL,
  `renewed_to_policy_id` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `insurance_policies_policy_number_unique` (`policy_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurance_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurance_products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `carrier_id` int NOT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `coverage_type` enum('comprehensive','third_party','third_party_fire_theft') COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_premium_monthly` int DEFAULT NULL,
  `base_premium_annual` int DEFAULT NULL,
  `vehicle_damage_limit` int DEFAULT NULL,
  `third_party_liability_limit` int DEFAULT NULL,
  `personal_accident_limit` int DEFAULT NULL,
  `excess_options` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eligibility_rules` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_rate` decimal(5,2) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurance_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurance_quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` int NOT NULL,
  `vehicle_id` int NOT NULL,
  `carrier_id` int NOT NULL,
  `product_id` int NOT NULL,
  `premium_amount` int NOT NULL,
  `premium_frequency` enum('monthly','annual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'monthly',
  `excess_amount` int DEFAULT NULL,
  `coverage_limits` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `driver_details` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risk_profile` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_valid_until` timestamp NOT NULL,
  `status` enum('pending','payment_pending','payment_submitted','payment_verified','accepted','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `kinga_insights` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `payment_method` enum('cash','bank_transfer','ecocash','onemoney','rtgs','zipit') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_reference_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_proof_s3_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_proof_s3_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_amount` int DEFAULT NULL,
  `payment_date` timestamp NULL DEFAULT NULL,
  `payment_submitted_at` timestamp NULL DEFAULT NULL,
  `payment_verified_at` timestamp NULL DEFAULT NULL,
  `payment_verified_by` int DEFAULT NULL,
  `payment_rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `insurance_quotes_quote_number_unique` (`quote_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1740001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurer_marketplace_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurer_marketplace_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `insurer_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `marketplace_profile_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `linked_by` int DEFAULT NULL,
  `linked_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `suspended_at` timestamp NULL DEFAULT NULL,
  `suspension_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_insurer_marketplace_link` (`insurer_tenant_id`,`marketplace_profile_id`),
  KEY `idx_insurer_marketplace_links_tenant` (`insurer_tenant_id`),
  KEY `idx_insurer_marketplace_links_profile` (`marketplace_profile_id`),
  CONSTRAINT `restore_fk_insurer_marketplace_links_fk_iml_marketplace_prof` FOREIGN KEY (`marketplace_profile_id`) REFERENCES `marketplace_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurer_marketplace_relationships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurer_marketplace_relationships` (
  `id` int NOT NULL AUTO_INCREMENT,
  `insurer_tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `marketplace_profile_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `relationship_status` enum('approved','suspended','blacklisted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
  `sla_signed` tinyint(1) NOT NULL DEFAULT '0',
  `preferred` tinyint(1) NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_insurer_relationship` (`insurer_tenant_id`,`marketplace_profile_id`),
  KEY `idx_imr_tenant` (`insurer_tenant_id`),
  KEY `idx_imr_profile` (`marketplace_profile_id`),
  KEY `idx_imr_status` (`relationship_status`),
  CONSTRAINT `restore_fk_insurer_marketplace_relationships_fk_imr_profile` FOREIGN KEY (`marketplace_profile_id`) REFERENCES `marketplace_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=7890001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurer_quote_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurer_quote_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `insurer_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agency_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','sent','quoted','accepted','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `quote_amount` decimal(12,2) DEFAULT NULL,
  `quote_currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ZAR',
  `quote_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_valid_until` timestamp NULL DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `quoted_at` timestamp NULL DEFAULT NULL,
  `responded_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `request_type` enum('standard_claim','fleet_policy') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard_claim',
  `claim_source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'direct',
  `fleet_account_id` int DEFAULT NULL,
  `vehicle_count` int DEFAULT NULL,
  `estimated_total_value` decimal(14,2) DEFAULT NULL,
  `claims_history_summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_estimate` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_claim_insurer_quote` (`claim_id`,`insurer_tenant_id`),
  KEY `idx_iqr_claim_id` (`claim_id`),
  KEY `idx_iqr_insurer_tenant` (`insurer_tenant_id`),
  KEY `idx_iqr_agency_tenant` (`agency_tenant_id`),
  KEY `idx_iqr_status` (`status`),
  CONSTRAINT `restore_fk_insurer_quote_requests_fk_insurer_quote_requests_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1860001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `insurer_tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `insurer_tenants` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `logo_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `primary_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#10b981',
  `secondary_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT '#64748b',
  `document_naming_template` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_retention_years` int DEFAULT '7',
  `fraud_retention_years` int DEFAULT '10',
  `require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
  `high_value_threshold` decimal(10,2) DEFAULT '10000.00',
  `auto_approve_below` decimal(10,2) DEFAULT '5000.00',
  `fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `primary_currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `primary_currency_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '$',
  `secondary_currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `secondary_currency_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exchange_rate` decimal(10,4) DEFAULT NULL,
  `pricing_tier` enum('process','protect','prove') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'process',
  `monthly_platform_fee` decimal(10,2) NOT NULL DEFAULT '900.00',
  `per_claim_fee` decimal(8,2) NOT NULL DEFAULT '12.00',
  `tier_feature_flags` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `iso_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `iso_audit_logs` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `user_role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` enum('create','update','approve','reject','view','delete') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `before_state` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `after_state` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `integrity_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_iso_audit_logs_tenant_id` (`tenant_id`),
  KEY `idx_iso_audit_logs_user_id` (`user_id`),
  KEY `idx_iso_audit_logs_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `licensing_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `licensing_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fleet_account_id` int NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_type` enum('vehicle_license','roadworthy','operator_permit','cross_border','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_date` timestamp NULL DEFAULT NULL,
  `expiry_date` timestamp NOT NULL,
  `issuing_authority` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cost_cents` int DEFAULT NULL,
  `licensing_status` enum('active','expired','expiring_soon','pending_renewal') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `document_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_lic_fleet` (`fleet_account_id`),
  KEY `idx_lic_vehicle` (`vehicle_registration`),
  KEY `idx_lic_expiry` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `maintenance_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `schedule_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alert_type` enum('upcoming_maintenance','overdue_maintenance','inspection_due','safety_alert','compliance_alert') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `due_date` timestamp NULL DEFAULT NULL,
  `due_mileage` int DEFAULT NULL,
  `status` enum('pending','acknowledged','resolved','dismissed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `acknowledged_by` int DEFAULT NULL,
  `acknowledged_at` timestamp NULL DEFAULT NULL,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `maintenance_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `schedule_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_date` timestamp NOT NULL,
  `service_mileage` int DEFAULT NULL,
  `service_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_provider` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `labor_cost` int DEFAULT NULL,
  `parts_cost` int DEFAULT NULL,
  `total_cost` int DEFAULT NULL,
  `service_items` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parts_replaced` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_report_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_compliant` tinyint DEFAULT '1',
  `was_overdue` tinyint DEFAULT '0',
  `days_overdue` int DEFAULT NULL,
  `performed_by` int DEFAULT NULL,
  `recorded_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `related_claim_id` int DEFAULT NULL COMMENT 'Link to claims table if this maintenance is claim-related',
  `is_claim_related` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `maintenance_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `maintenance_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_type` enum('oil_change','tire_rotation','brake_inspection','engine_service','transmission_service','annual_inspection','safety_inspection','filter_replacement','battery_check','coolant_flush','custom') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interval_type` enum('mileage','time','both') COLLATE utf8mb4_unicode_ci NOT NULL,
  `mileage_interval` int DEFAULT NULL,
  `time_interval` int DEFAULT NULL,
  `last_service_date` timestamp NULL DEFAULT NULL,
  `last_service_mileage` int DEFAULT NULL,
  `next_due_date` timestamp NULL DEFAULT NULL,
  `next_due_mileage` int DEFAULT NULL,
  `alert_days_before` int DEFAULT '7',
  `alert_mileage_before` int DEFAULT '500',
  `is_active` tinyint DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketplace_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplace_profiles` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `type` enum('assessor','panel_beater') COLLATE utf8mb4_unicode_ci NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country_id` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZA',
  `contact_email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specializations` json DEFAULT NULL,
  `approval_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_marketplace_profiles_type` (`type`),
  KEY `idx_marketplace_profiles_approval_status` (`approval_status`),
  KEY `idx_marketplace_profiles_country_id` (`country_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `marketplace_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `marketplace_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `assessor_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `assessment_fee` decimal(10,2) NOT NULL,
  `kinga_commission` decimal(10,2) NOT NULL,
  `assessor_payout` decimal(10,2) NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `transaction_status` enum('pending','completed','paid_out','disputed','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `completed_at` timestamp NULL DEFAULT NULL,
  `paid_out_at` timestamp NULL DEFAULT NULL,
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_assignment` (`assignment_id`),
  KEY `idx_assessor` (`assessor_id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_status` (`transaction_status`),
  KEY `fk_marketplace_transactions_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_marketplace_transactions_fk_marketplace_transacti` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `measurement_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `measurement_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mm',
  `tier` int NOT NULL DEFAULT '2',
  `base_reliability` decimal(4,3) NOT NULL DEFAULT '0.750',
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mismatch_annotations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `mismatch_annotations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessment_id` int NOT NULL,
  `mismatch_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mismatch_index` int NOT NULL DEFAULT '0',
  `action` enum('confirm','dismiss') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int NOT NULL,
  `user_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ma_claim` (`claim_id`),
  KEY `idx_ma_type` (`mismatch_type`),
  KEY `idx_ma_user` (`user_id`),
  KEY `idx_ma_action` (`action`),
  CONSTRAINT `restore_fk_mismatch_annotations_fk_mismatch_annotations_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `ml_models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ml_models` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `training_claim_count` int DEFAULT NULL,
  `accuracy_score` decimal(5,4) DEFAULT NULL,
  `auc_score` decimal(5,4) DEFAULT NULL,
  `feature_importance` json DEFAULT NULL,
  `is_active` tinyint DEFAULT '0',
  `trained_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `activated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_mm_model_name` (`model_name`),
  KEY `idx_mm_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `model_training_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_training_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_version_id` int NOT NULL,
  `event_type` enum('training_started','training_completed','training_failed','validation_started','validation_completed','deployment_requested','deployment_approved','deployment_rejected','model_deprecated','dataset_added','dataset_removed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by` int DEFAULT NULL,
  `performed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `model_training_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_training_queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `dataset_record_id` int NOT NULL,
  `training_priority` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `processed` tinyint DEFAULT '0',
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_mtq_processed` (`processed`),
  KEY `idx_mtq_training_priority` (`training_priority`),
  KEY `idx_mtq_created_at` (`created_at`),
  KEY `fk_model_training_queue_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_model_training_queue_fk_model_training_queue_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=5970001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `model_version_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_version_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `algorithm_used` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `training_dataset_version` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `training_claim_count` int DEFAULT NULL,
  `training_started_at` timestamp NULL DEFAULT NULL,
  `training_completed_at` timestamp NULL DEFAULT NULL,
  `training_duration` int DEFAULT NULL,
  `accuracy_score` decimal(5,2) DEFAULT NULL,
  `precision_score` decimal(5,2) DEFAULT NULL,
  `recall_score` decimal(5,2) DEFAULT NULL,
  `f1_score` decimal(5,2) DEFAULT NULL,
  `bias_drift_validation` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_detection_stability` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performance_benchmark` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deployment_status` enum('training','validation','staging','production','deprecated','archived') COLLATE utf8mb4_unicode_ci DEFAULT 'training',
  `deployed_at` timestamp NULL DEFAULT NULL,
  `deployed_by` int DEFAULT NULL,
  `approval_status` enum('pending_validation','pending_approval','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending_validation',
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `approval_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_artifact_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_config_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `model_version_registry_model_version_unique` (`model_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `multi_reference_truth`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `multi_reference_truth` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `synthesized_value` decimal(10,2) NOT NULL,
  `confidence_interval` decimal(5,2) DEFAULT NULL,
  `photo_damage_severity_score` int DEFAULT NULL,
  `panel_beater_quote_cluster_score` int DEFAULT NULL,
  `regional_benchmark_score` int DEFAULT NULL,
  `similar_claims_score` int DEFAULT NULL,
  `fraud_probability_score` int DEFAULT NULL,
  `settlement_amount_score` int DEFAULT NULL,
  `photo_damage_estimate` decimal(10,2) DEFAULT NULL,
  `panel_beater_median` decimal(10,2) DEFAULT NULL,
  `regional_benchmark` decimal(10,2) DEFAULT NULL,
  `similar_claims_average` decimal(10,2) DEFAULT NULL,
  `final_settlement` decimal(10,2) DEFAULT NULL,
  `assessor_value` decimal(10,2) DEFAULT NULL,
  `assessor_deviation` decimal(5,2) DEFAULT NULL,
  `deviation_absolute` decimal(10,2) DEFAULT NULL,
  `synthesis_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `components_used` int DEFAULT NULL,
  `synthesis_quality` enum('high','medium','low') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `synthesized_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `synthesized_by` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `synthesis_explanation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `narrative_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `narrative_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessment_id` int NOT NULL,
  `mismatch_index` int NOT NULL,
  `mismatch_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `base_narrative` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `enriched_narrative` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `external_narrative` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preserves_meaning` tinyint DEFAULT NULL,
  `source` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint NOT NULL,
  `created_by` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_nv_claim` (`claim_id`),
  KEY `idx_nv_assessment` (`assessment_id`),
  KEY `idx_nv_type` (`mismatch_type`),
  KEY `idx_nv_active` (`is_active`),
  CONSTRAINT `restore_fk_narrative_versions_fk_narrative_versions_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipient_user_id` int NOT NULL,
  `recipient_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `idempotency_key` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sent` tinyint NOT NULL DEFAULT '1',
  `skip_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ne_idempotency_key` (`idempotency_key`),
  KEY `idx_ne_recipient` (`recipient_user_id`),
  KEY `idx_ne_event_type` (`event_type`),
  KEY `idx_ne_created_at` (`created_at`),
  UNIQUE KEY `idempotency_key` (`idempotency_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=11010001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_preferences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `module` varchar(64) NOT NULL COMMENT 'claims|fraud|vehicle_passport|asset_passport|engineering|fleet|timeline|recoveries|portfolio|predictive',
  `in_app_enabled` tinyint NOT NULL DEFAULT '1',
  `email_enabled` tinyint NOT NULL DEFAULT '0',
  `sms_enabled` tinyint NOT NULL DEFAULT '0',
  `min_priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'low',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_user_module` (`user_id`,`tenant_id`,`module`),
  KEY `idx_notif_pref_user` (`user_id`),
  KEY `idx_notif_pref_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('claim_assigned','quote_submitted','fraud_detected','status_changed','assessment_completed','approval_required','document_uploaded','system_alert') COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `is_read` tinyint NOT NULL DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `action_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority` enum('low','medium','high','urgent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `archived_at` timestamp NULL DEFAULT NULL,
  `module` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'claims|fraud|vehicle_passport|asset_passport|engineering|fleet|timeline|recoveries|portfolio|predictive',
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=14190001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Zimbabwe',
  `type` enum('insurer','broker','tpa') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'insurer',
  `owner_id` int NOT NULL,
  `active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `panel_beater_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `panel_beater_quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `panel_beater_id` int NOT NULL,
  `quoted_amount` int NOT NULL,
  `labor_cost` int DEFAULT NULL,
  `parts_cost` int DEFAULT NULL,
  `estimated_duration` int DEFAULT NULL,
  `labor_hours` int DEFAULT NULL COMMENT 'Estimated labor hours required for repairs',
  `itemized_breakdown` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modified` tinyint DEFAULT '0',
  `original_quoted_amount` int DEFAULT NULL,
  `modification_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `modified_by_assessor_id` int DEFAULT NULL,
  `panel_beater_agreed` tinyint DEFAULT NULL,
  `status` enum('draft','submitted','modified','accepted','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `components_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parts_quality` enum('aftermarket','oem','genuine','used') COLLATE utf8mb4_unicode_ci DEFAULT 'aftermarket',
  `warranty_months` int DEFAULT '12',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `quote_audit_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_congruency_score` decimal(5,2) DEFAULT NULL,
  `quote_type` enum('original','strip_requote','assessor_adjusted','supplementary','revised') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'original',
  `parent_quote_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_quotes_claim_id` (`claim_id`),
  KEY `idx_quotes_panel_beater_id` (`panel_beater_id`),
  KEY `idx_panel_beater_quotes_panel_beater_id` (`panel_beater_id`),
  CONSTRAINT `restore_fk_panel_beater_quotes_fk_panel_beater_quotes_claim_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=13740001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `panel_beater_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `panel_beater_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name_aliases` json DEFAULT NULL,
  `registration_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vat_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bank_account_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_quotes_submitted` int DEFAULT '0',
  `avg_quote_vs_true_cost_pct` decimal(5,2) DEFAULT NULL,
  `quotes_below_cost_count` int DEFAULT '0',
  `quotes_above_cost_count` int DEFAULT '0',
  `structural_gap_count` int DEFAULT '0',
  `avg_structural_gap_count` decimal(4,1) DEFAULT NULL,
  `assessor_routing` json DEFAULT NULL,
  `top_assessor_id` int DEFAULT NULL,
  `top_assessor_pct` decimal(5,2) DEFAULT NULL,
  `routing_concentration_score` int DEFAULT '0',
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `is_watchlisted` tinyint DEFAULT '0',
  `watchlist_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_pbr_company_name` (`company_name`),
  KEY `idx_pbr_routing_concentration` (`routing_concentration_score`),
  KEY `idx_pbr_risk_score` (`risk_score`),
  KEY `idx_pbr_bank_hash` (`bank_account_hash`),
  KEY `idx_pbr_tenant` (`tenant_id`),
  KEY `idx_panel_beater_registry_tenant` (`tenant_id`),
  KEY `idx_pb_quotes_below` (`quotes_below_cost_count`),
  KEY `idx_pb_watchlist` (`is_watchlisted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=360001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `panel_beaters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `panel_beaters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_name` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved` tinyint NOT NULL DEFAULT '1',
  `panel_beater_status` enum('pending','approved','suspended','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
  `user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_repairs` int NOT NULL DEFAULT '0',
  `avg_quality_score` decimal(5,2) DEFAULT NULL,
  `avg_cost_ratio` decimal(6,3) DEFAULT NULL,
  `avg_repair_duration_days` decimal(6,1) DEFAULT NULL,
  `repeat_damage_rate_pct` decimal(5,2) DEFAULT NULL,
  `warranty_repair_count` int NOT NULL DEFAULT '0',
  `fraud_flag_count` int NOT NULL DEFAULT '0',
  `performance_tier` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'A/B/C/D based on quality score',
  `last_repair_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performance_updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=4170001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `part_stratification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `part_stratification` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_multiplier` decimal(5,2) NOT NULL,
  `quality_rating` int DEFAULT NULL,
  `warranty_months` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `parts_pricing_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `parts_pricing_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `change_type` enum('baseline_update','multiplier_update','override_created','override_deleted','scraper_run') COLLATE utf8mb4_unicode_ci NOT NULL,
  `table_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `record_id` int DEFAULT NULL,
  `old_value` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_value` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by` int DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `parts_pricing_baseline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `parts_pricing_baseline` (
  `id` int NOT NULL AUTO_INCREMENT,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year_from` int DEFAULT NULL,
  `vehicle_year_to` int DEFAULT NULL,
  `sa_base_price` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZAR',
  `source` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scraped_at` timestamp NULL DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confidence` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `data_quality` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_type` enum('OEM','OEM_Equivalent','Aftermarket','Used','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `parts_pricing_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `parts_pricing_overrides` (
  `id` int NOT NULL AUTO_INCREMENT,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `override_price` decimal(10,2) DEFAULT NULL,
  `override_multiplier` decimal(5,2) DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pdf_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pdf_reports` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `snapshot_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size_bytes` int NOT NULL,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_snapshot_id` (`snapshot_id`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `personal_vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `personal_vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `year` int NOT NULL,
  `vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `colour` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `engine_size` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fuel_type` enum('petrol','diesel','electric','hybrid','other') COLLATE utf8mb4_unicode_ci DEFAULT 'petrol',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_primary` tinyint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `personal_vehicles_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `photo_reextraction_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `photo_reextraction_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assessment_id` int NOT NULL,
  `claim_id` int NOT NULL,
  `pdf_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','running','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `requested_dpi` int NOT NULL DEFAULT '300',
  `photos_extracted` int DEFAULT NULL,
  `render_dpi` int DEFAULT NULL,
  `avg_sharpness` int DEFAULT NULL,
  `result_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completed_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_ms` int DEFAULT NULL,
  `triggered_by_user_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_prerj_assessment_id` (`assessment_id`),
  KEY `idx_prerj_claim_id` (`claim_id`),
  KEY `idx_prerj_status` (`status`),
  CONSTRAINT `restore_fk_photo_reextraction_jobs_fk_photo_reextraction_job` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `physical_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `physical_measurements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inspection_id` int NOT NULL,
  `measurement_category` enum('vehicle_crush','structural','mechanical','electrical','fire_protection','industrial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `measurement_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` decimal(15,4) NOT NULL,
  `value_min` decimal(15,4) DEFAULT NULL,
  `value_max` decimal(15,4) DEFAULT NULL,
  `unit` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `instrument` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `measurement_method` enum('manual','laser','ai_assisted','imported','photogrammetric','ultrasonic','thermal','load_cell','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manual',
  `calibration_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
  `captured_by` int NOT NULL,
  `captured_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ENGINEER_MEASUREMENT',
  `evidence_document_ids` json DEFAULT NULL,
  `location_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_image_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_body` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_code` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_clause` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `standards_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_pm_inspection` (`inspection_id`),
  KEY `idx_pm_tenant` (`tenant_id`),
  KEY `idx_pm_category` (`measurement_category`),
  KEY `idx_pm_captured_by` (`captured_by`),
  KEY `idx_pm_captured_at` (`captured_at`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `physics_validation_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `physics_validation_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assessment_id` int DEFAULT NULL,
  `predicted_speed_kmh` decimal(6,2) DEFAULT NULL,
  `predicted_speed_low_kmh` decimal(6,2) DEFAULT NULL,
  `predicted_speed_high_kmh` decimal(6,2) DEFAULT NULL,
  `predicted_crush_depth_mm` decimal(7,2) DEFAULT NULL,
  `predicted_repair_cost_local` decimal(12,2) DEFAULT NULL,
  `predicted_delta_v_kmh` decimal(6,2) DEFAULT NULL,
  `uncertainty_grade` varchar(1) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `integrity_score` int DEFAULT NULL,
  `actual_speed_kmh` decimal(6,2) DEFAULT NULL,
  `actual_repair_cost_local` decimal(12,2) DEFAULT NULL,
  `actual_damage_zone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actual_settlement_amount` decimal(12,2) DEFAULT NULL,
  `adjuster_override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `speed_deviation_pct` decimal(7,3) DEFAULT NULL,
  `cost_deviation_pct` decimal(7,3) DEFAULT NULL,
  `speed_within_ci` tinyint DEFAULT NULL,
  `calibration_feedback_json` json DEFAULT NULL,
  `validation_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `validated_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_pvr_claim_id` (`claim_id`),
  KEY `idx_pvr_assessment_id` (`assessment_id`),
  KEY `idx_pvr_validation_status` (`validation_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=6630001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pipeline_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pipeline_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `run_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stage_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stage_label` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stage_index` int NOT NULL DEFAULT '0',
  `status` enum('pending','running','completed','failed','skipped','degraded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_ms` int DEFAULT NULL,
  `is_degraded` tinyint NOT NULL DEFAULT '0',
  `is_timeout` tinyint NOT NULL DEFAULT '0',
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `llm_tokens_input` int DEFAULT NULL,
  `llm_tokens_output` int DEFAULT NULL,
  `llm_model` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assumption_count` int NOT NULL DEFAULT '0',
  `recovery_action_count` int NOT NULL DEFAULT '0',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `result_json` mediumtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Serialised stage output JSON for partial resume',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_pj_claim_run` (`claim_id`,`run_id`),
  KEY `idx_pj_run_stage` (`run_id`,`stage_id`),
  KEY `idx_pj_claim_id` (`claim_id`),
  KEY `idx_pj_status` (`status`),
  KEY `idx_pj_tenant` (`tenant_id`),
  KEY `idx_pj_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8310001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pipeline_runs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pipeline_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `run_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `triggered_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `trigger_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('running','completed','failed','partial') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'running',
  `is_rerun` tinyint NOT NULL DEFAULT '0',
  `total_duration_ms` int DEFAULT NULL,
  `total_llm_tokens` int DEFAULT NULL,
  `stages_completed` int NOT NULL DEFAULT '0',
  `stages_failed` int NOT NULL DEFAULT '0',
  `stages_degraded` int NOT NULL DEFAULT '0',
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_pr_run_id` (`run_id`),
  KEY `idx_pr_claim_id` (`claim_id`),
  KEY `idx_pr_tenant` (`tenant_id`),
  KEY `idx_pr_status` (`status`),
  KEY `idx_pr_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=7890001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_governance_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_governance_limits` (
  `id` int NOT NULL AUTO_INCREMENT,
  `max_auto_approval_limit_global` int NOT NULL,
  `min_confidence_allowed_global` decimal(5,2) NOT NULL,
  `max_fraud_tolerance_global` decimal(5,2) NOT NULL,
  `version` int NOT NULL,
  `effective_from` timestamp NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_gov_limits_version` (`version`),
  KEY `idx_gov_limits_effective` (`effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=3030001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform_observability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_observability` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metric_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metric_value` decimal(10,2) NOT NULL,
  `metric_date` date NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_tenant_metric` (`tenant_id`,`metric_name`,`metric_date`),
  KEY `idx_metric_date` (`metric_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `police_officer_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `police_officer_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `badge_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `station` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `officer_rank` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_claims` int DEFAULT '0',
  `claim_ids_json` json DEFAULT NULL,
  `insurer_ids_json` json DEFAULT NULL,
  `assessor_co_occurrences` json DEFAULT NULL,
  `top_assessor_id` int DEFAULT NULL,
  `top_assessor_count` int DEFAULT '0',
  `claimant_co_occurrences` json DEFAULT NULL,
  `incident_locations` json DEFAULT NULL,
  `location_concentration_score` int DEFAULT '0',
  `risk_score` int DEFAULT '0',
  `risk_flags` json DEFAULT NULL,
  `is_watchlisted` tinyint DEFAULT '0',
  `watchlist_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_por_full_name` (`full_name`),
  KEY `idx_por_badge_number` (`badge_number`),
  KEY `idx_por_total_claims` (`total_claims`),
  KEY `idx_por_risk_score` (`risk_score`),
  KEY `idx_por_tenant` (`tenant_id`),
  KEY `idx_por_watchlisted` (`is_watchlisted`),
  KEY `idx_police_officer_registry_tenant` (`tenant_id`),
  KEY `idx_police_officer_registry_badge` (`badge_number`(50)),
  KEY `idx_police_officer_risk` (`risk_score`),
  KEY `idx_police_officer_watchlist` (`is_watchlisted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=720001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `police_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `police_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `report_number` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `police_station` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `officer_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `officer_badge_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_date` timestamp NULL DEFAULT NULL,
  `reported_speed` int DEFAULT NULL,
  `reported_weather` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_road_condition` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reported_visibility` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_location` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `violations_issued` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `citation_numbers` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_statements` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `witness_count` int DEFAULT '0',
  `police_photos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accident_diagram` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `report_document_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `speed_discrepancy` int DEFAULT NULL,
  `location_mismatch` tinyint DEFAULT '0',
  `weather_mismatch` tinyint DEFAULT '0',
  `description_inconsistent` tinyint DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `road_surface` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle1_mass` int DEFAULT NULL,
  `vehicle2_mass` int DEFAULT NULL,
  `skid_mark_length` decimal(10,2) DEFAULT NULL,
  `impact_speed` int DEFAULT NULL,
  `road_gradient` decimal(5,2) DEFAULT NULL,
  `lighting_condition` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `traffic_condition` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ocr_extracted` tinyint DEFAULT '0',
  `ocr_confidence` int DEFAULT NULL,
  `ocr_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8310001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `policy_claim_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `policy_claim_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_id` int NOT NULL,
  `claim_id` int NOT NULL,
  `coverage_verified` tinyint DEFAULT '0',
  `verified_by` int DEFAULT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `coverage_approved` tinyint DEFAULT NULL,
  `coverage_decision_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_policy_claim_links_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_policy_claim_links_fk_policy_claim_links_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `policy_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `policy_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_id` int NOT NULL,
  `document_type` enum('policy_schedule','certificate_of_insurance','endorsement','cancellation_notice','renewal_notice','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '1',
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `policy_endorsements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `policy_endorsements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_id` int NOT NULL,
  `endorsement_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endorsement_type` enum('add_driver','remove_driver','change_vehicle','adjust_coverage','change_excess','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `endorsement_details` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `premium_adjustment` int DEFAULT NULL,
  `new_premium_amount` int DEFAULT NULL,
  `effective_date` timestamp NOT NULL,
  `created_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `policy_endorsements_endorsement_number_unique` (`endorsement_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pre_accident_damage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `pre_accident_damage` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `damage_type` enum('rust','dent','scratch','paint_damage','mechanical','glass','interior','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('minor','moderate','severe') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documented_date` timestamp NULL DEFAULT NULL,
  `estimated_age` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_related_to_current_claim` tinyint DEFAULT '0',
  `assessor_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documented_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_pre_accident_damage_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_pre_accident_damage_fk_pre_accident_damage_claim_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `predictive_risk_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `predictive_risk_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `entity_type` enum('vehicle','driver','fleet','portfolio') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_type` enum('renewal_risk','fraud_propensity','fleet_trajectory','portfolio_forecast') COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_version` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1.0.0',
  `score` decimal(5,2) DEFAULT NULL,
  `prediction` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `confidence` decimal(5,2) DEFAULT NULL,
  `score_factors_json` json DEFAULT NULL,
  `computed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_prs_entity_model` (`entity_type`,`entity_id`,`model_type`,`model_version`),
  KEY `idx_prs_entity` (`entity_type`,`entity_id`),
  KEY `idx_prs_tenant` (`tenant_id`),
  KEY `idx_prs_model_type` (`model_type`),
  KEY `idx_prs_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quality_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quality_metrics` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `metric_type` enum('processing_time','approval_rate','fraud_detection','cost_savings') COLLATE utf8mb4_unicode_ci NOT NULL,
  `metric_value` decimal(10,2) NOT NULL,
  `period_start` timestamp NOT NULL,
  `period_end` timestamp NOT NULL,
  `calculated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_quality_metrics_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quotation_request_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotation_request_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quotation_request_id` int NOT NULL,
  `client_user_id` int DEFAULT NULL,
  `document_type` enum('policy_schedule','certificate_of_insurance','endorsement','renewal_notice','cancellation_notice','cover_note','debit_note','claim_form','proposal_form','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int DEFAULT NULL,
  `mime_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sent_by_agent_id` int DEFAULT NULL,
  `delivered_to_client` tinyint NOT NULL DEFAULT '1',
  `emailed_to_client` tinyint NOT NULL DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `qrd_quotation_request_id` (`quotation_request_id`),
  KEY `qrd_client_user_id` (`client_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quotation_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotation_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurance_type` enum('comprehensive','third_party','third_party_fire_theft','fleet','commercial') COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_category` enum('motor','property','engineering','liability','bonds','personal','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'motor',
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_year` int NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_vin` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_value` int DEFAULT NULL,
  `vehicle_usage` enum('private','business','both') COLLATE utf8mb4_unicode_ci DEFAULT 'private',
  `driver_age` int DEFAULT NULL,
  `driver_license_years` int DEFAULT NULL,
  `claims_history` int DEFAULT '0',
  `excess_amount` int DEFAULT NULL,
  `additional_cover` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documents` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quoted_premium` int DEFAULT NULL,
  `quoted_annual_premium` int DEFAULT NULL,
  `quoted_excess` int DEFAULT NULL,
  `quote_valid_until` timestamp NULL DEFAULT NULL,
  `quote_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','under_review','quoted','accepted','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `assigned_agent_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `vehicle_forensics_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Photo forensics engine result JSON (PhotoForensicsSummary) for vehicle photos uploaded during quotation',
  `vehicle_risk_score` int DEFAULT NULL COMMENT 'Computed vehicle risk score 0-100 derived from photo forensics + damage detection',
  `vehicle_forensics_status` enum('pending','processing','complete','failed') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Status of the photo forensics analysis for this quotation',
  `report_gating_status` enum('teaser','full','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'teaser',
  `report_unlocked_at` timestamp NULL DEFAULT NULL,
  `is_standalone_valuation` tinyint(1) NOT NULL DEFAULT '0',
  `payment_intent_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inspection_required` tinyint(1) NOT NULL DEFAULT '0',
  `inspection_assigned_to` int DEFAULT NULL,
  `fleet_vehicle_count` int DEFAULT NULL,
  `submission_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_verified` tinyint(1) NOT NULL DEFAULT '0',
  `insured_asset_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insured_asset_value` int DEFAULT NULL,
  `coverage_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `business_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_value` int DEFAULT NULL,
  `project_duration_months` int DEFAULT NULL,
  `bond_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bond_amount` int DEFAULT NULL,
  `bond_beneficiary` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `request_number` (`request_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2280001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_evidence_gaps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_evidence_gaps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `quote_id` int DEFAULT NULL,
  `quote_line_item_id` int DEFAULT NULL,
  `source_document_id` int NOT NULL,
  `source_page` int DEFAULT NULL,
  `source_location` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_crop_ref` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observable_characters` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ambiguity_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_confidence` decimal(5,4) DEFAULT NULL,
  `quantity_confidence` decimal(5,4) DEFAULT NULL,
  `unit_price_confidence` decimal(5,4) DEFAULT NULL,
  `extended_amount_confidence` decimal(5,4) DEFAULT NULL,
  `transcription_method` enum('document_direct','ocr','vision','human_verified') COLLATE utf8mb4_unicode_ci NOT NULL,
  `candidate_readings_json` json DEFAULT NULL,
  `arithmetic_residual_cents` bigint DEFAULT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `impact_json` json DEFAULT NULL,
  `resolution_status` enum('open','human_verification_requested','human_verified','superseded','not_resolvable_from_source') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `review_fields_json` json DEFAULT NULL,
  `reviewed_by_user_id` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `quote_evidence_gaps_tenant_claim_idx` (`tenant_id`,`claim_id`),
  KEY `quote_evidence_gaps_quote_idx` (`quote_id`,`quote_line_item_id`),
  KEY `quote_evidence_gaps_source_idx` (`source_document_id`,`source_page`),
  KEY `quote_evidence_gaps_resolution_idx` (`resolution_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_evidence_ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_evidence_ledger` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `quote_id` int DEFAULT NULL,
  `quote_line_item_id` int DEFAULT NULL,
  `source_document_id` int NOT NULL,
  `source_page` int DEFAULT NULL,
  `source_location` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_row_label` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_text` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `canonical_component` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `financial_role` enum('quote_total','subtotal','vat','parts','labour','paint','sundries','component','discount','fee','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tax_basis` enum('included','excluded','separately_stated','not_stated','not_applicable') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scope_fingerprint` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `revision_status` enum('original','revised','superseded','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'original',
  `extraction_method` enum('document_direct','ocr','vision','human_verified','system_reconstruction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `extraction_confidence` decimal(5,4) DEFAULT NULL,
  `evidence_status` enum('verified','reconstructed','documented_revision','scope_difference','extraction_defect','evidence_gap','pricing_variance_review_signal','unresolved') COLLATE utf8mb4_unicode_ci NOT NULL,
  `verification_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `quote_evidence_ledger_tenant_claim_idx` (`tenant_id`,`claim_id`),
  KEY `quote_evidence_ledger_quote_idx` (`quote_id`,`quote_line_item_id`),
  KEY `quote_evidence_ledger_source_idx` (`source_document_id`,`source_page`),
  KEY `quote_evidence_ledger_scope_status_idx` (`scope_fingerprint`,`evidence_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=1742916;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_line_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_line_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_id` int NOT NULL,
  `item_number` int DEFAULT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` enum('parts','labor','paint','diagnostic','sundries','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `line_total` decimal(10,2) NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD',
  `vat_rate` decimal(5,2) DEFAULT '15.00',
  `vat_amount` decimal(10,2) DEFAULT NULL,
  `total_with_vat` decimal(10,2) DEFAULT NULL,
  `is_repair` tinyint DEFAULT '0',
  `is_replacement` tinyint DEFAULT '1',
  `betterment_amount` decimal(10,2) DEFAULT NULL,
  `net_cost` decimal(10,2) DEFAULT NULL,
  `is_price_inflated` tinyint DEFAULT '0',
  `is_unrelated_damage` tinyint DEFAULT '0',
  `is_missing_in_other_quotes` tinyint DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `ai_review` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_origin` enum('oem','aftermarket','reconditioned','used','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `repairer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=7020001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `quote_optimisation_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_optimisation_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL COMMENT 'FK → claims.id',
  `triggered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `triggered_by` int DEFAULT NULL COMMENT 'FK → users.id (NULL = auto-triggered)',
  `status` enum('pending','processing','completed','failed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `quote_analysis` json DEFAULT NULL COMMENT 'Array of {profileId, companyName, totalAmount, partsAmount, labourAmount, costDeviationPct, flags[]}',
  `recommended_profile_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'marketplace_profiles.id of recommended repairer',
  `recommended_company_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overall_risk_score` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risk_score_numeric` decimal(5,2) DEFAULT NULL COMMENT '0-100 scale',
  `overpricing_detected` tinyint(1) NOT NULL DEFAULT '0',
  `parts_inflation_detected` tinyint(1) NOT NULL DEFAULT '0',
  `labour_inflation_detected` tinyint(1) NOT NULL DEFAULT '0',
  `optimisation_summary` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable AI analysis narrative',
  `raw_llm_response` json DEFAULT NULL COMMENT 'Full structured LLM output for audit',
  `insurer_accepted_recommendation` tinyint(1) DEFAULT NULL COMMENT 'NULL=pending, 1=accepted, 0=overridden',
  `insurer_decision_by` int DEFAULT NULL,
  `insurer_decision_at` timestamp NULL DEFAULT NULL,
  `insurer_override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_qor_claim_id` (`claim_id`),
  KEY `idx_qor_status` (`status`),
  KEY `idx_qor_risk` (`overall_risk_score`),
  CONSTRAINT `restore_fk_quote_optimisation_results_fk_quote_optimisation_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=7680001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `rate_limit_tracking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `rate_limit_tracking` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `window_start` timestamp NOT NULL,
  `action_count` int NOT NULL DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_user_tenant_action_window` (`user_id`,`tenant_id`,`action_type`,`window_start`),
  KEY `idx_window_start` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `recovery_cases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `recovery_cases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `recovery_potential_score` int NOT NULL DEFAULT '0',
  `wronged_party` enum('insured','third_party','shared','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `third_party_liability_pct` int DEFAULT '0',
  `third_party_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_contact_details` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approved_settlement_amount` int DEFAULT NULL,
  `recovered_amount` int DEFAULT NULL,
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'ZAR',
  `status` enum('pending_review','under_investigation','open','demand_sent','liability_denied','disputed_legal','settled_full','settled_partial','closed_no_recovery','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_review',
  `investigation_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `investigation_expected_resolution_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recovery_deadline` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recovery_deadline_alert_sent_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `demand_letter_sent_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `demand_letter_s3_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `demand_letter_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `demand_response_due_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `demand_response_received_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settlement_agreement_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settlement_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_officer_user_id` int DEFAULT NULL,
  `assigned_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `officer_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ai_demand_letter_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `closed_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_repeat_offender` tinyint(1) NOT NULL DEFAULT '0',
  `prior_case_count` int NOT NULL DEFAULT '0',
  `prior_case_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer_contact` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer_policy_ref` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer_is_on_kinga` tinyint DEFAULT '0',
  `third_party_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_id_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `third_party_insurer_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_report_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_station` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `police_report_extracted_at` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `recovery_target` enum('insurer','individual','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_rc_tenant_id` (`tenant_id`),
  KEY `idx_rc_claim_id` (`claim_id`),
  KEY `idx_rc_status` (`status`),
  KEY `idx_rc_tenant_status` (`tenant_id`,`status`),
  KEY `idx_rc_assigned_officer` (`assigned_officer_user_id`),
  KEY `idx_rc_rps` (`recovery_potential_score`),
  KEY `idx_rc_prescription` (`recovery_deadline`),
  UNIQUE KEY `uq_recovery_cases_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_recovery_cases_fk_rc_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2910001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `recovery_correspondence_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `recovery_correspondence_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `recovery_case_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entry_type` enum('demand_letter_generated','demand_letter_sent','response_received','follow_up_sent','legal_escalation','settlement_offer','settlement_accepted','settlement_rejected','case_note','status_change','recovery_target_changed','system_event') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'case_note',
  `actor_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_name` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachment_url` varchar(1024) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `from_status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_status` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `from_target` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_target` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount_cents` int DEFAULT NULL,
  `currency_code` varchar(8) COLLATE utf8mb4_unicode_ci DEFAULT 'ZAR',
  `created_at` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_rcl_case_id` (`recovery_case_id`),
  KEY `idx_rcl_tenant_id` (`tenant_id`),
  KEY `idx_rcl_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reference_dataset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reference_dataset` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dataset_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `included_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `used_for_benchmarking` tinyint DEFAULT '0',
  `used_for_analytics` tinyint DEFAULT '0',
  `last_accessed_at` timestamp NULL DEFAULT NULL,
  `reference_purpose` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `reference_dataset_historical_claim_id_unique` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `regional_benchmarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `regional_benchmarks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year_range` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `labor_rate_per_hour` decimal(10,2) DEFAULT NULL,
  `paint_cost_per_panel` decimal(10,2) DEFAULT NULL,
  `common_parts_costs` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sample_size` int DEFAULT NULL,
  `confidence_level` decimal(5,2) DEFAULT NULL,
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `regional_pricing_multipliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `regional_pricing_multipliers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `country` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country_code` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transport_cost_multiplier` decimal(5,2) NOT NULL,
  `duty_rate` decimal(5,2) NOT NULL,
  `handling_fee_flat` decimal(10,2) DEFAULT '0.00',
  `margin_multiplier` decimal(5,2) DEFAULT '1.10',
  `currency_code` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exchange_rate_to_usd` decimal(15,6) NOT NULL,
  `exchange_rate_source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `regional_pricing_multipliers_country_unique` (`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `registration_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `registration_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('panel_beater','assessor') COLLATE utf8mb4_unicode_ci NOT NULL,
  `business_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `years_experience` int DEFAULT NULL,
  `specializations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `documents_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `review_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_cost_intelligence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_cost_intelligence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_year` int DEFAULT NULL,
  `damage_category` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `country` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZA',
  `median_repair_cost` int NOT NULL,
  `min_repair_cost` int NOT NULL,
  `max_repair_cost` int NOT NULL,
  `claim_count` int NOT NULL DEFAULT '0',
  `intelligence_confidence` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low',
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_rci_unique` (`vehicle_make`,`vehicle_model`,`damage_category`,`country`),
  KEY `idx_rci_make_model` (`vehicle_make`,`vehicle_model`),
  KEY `idx_rci_damage_category` (`damage_category`),
  KEY `idx_rci_country` (`country`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `repair_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `repair_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `repairer_id` int NOT NULL,
  `vehicle_id` int DEFAULT NULL,
  `claim_id` int NOT NULL,
  `components_repaired_json` text DEFAULT NULL,
  `component_count` int NOT NULL DEFAULT '0',
  `component_match_score` int NOT NULL DEFAULT '100',
  `repair_cost_cents` int NOT NULL DEFAULT '0',
  `labour_cost_cents` int NOT NULL DEFAULT '0',
  `parts_cost_cents` int NOT NULL DEFAULT '0',
  `ai_estimated_cost_cents` int NOT NULL DEFAULT '0',
  `cost_deviation_pct` decimal(7,2) DEFAULT NULL,
  `approval_date` varchar(20) DEFAULT NULL,
  `repair_date` varchar(20) DEFAULT NULL,
  `repair_duration_days` int DEFAULT NULL,
  `repeat_damage_within_12_months` tinyint NOT NULL DEFAULT '0',
  `repair_cost_ratio` decimal(6,3) DEFAULT NULL,
  `repair_quality_score` int NOT NULL DEFAULT '0',
  `is_warranty_repair` tinyint NOT NULL DEFAULT '0',
  `original_repair_id` int DEFAULT NULL,
  `is_fraud_flagged` tinyint NOT NULL DEFAULT '0',
  `fraud_signals_json` text DEFAULT NULL,
  `damage_history_ids_json` text DEFAULT NULL,
  `damage_history_link_count` int NOT NULL DEFAULT '0',
  `tenant_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_rh_repairer_id` (`repairer_id`),
  KEY `idx_rh_vehicle_id` (`vehicle_id`),
  KEY `idx_rh_claim_id` (`claim_id`),
  KEY `idx_rh_repair_date` (`repair_date`),
  KEY `idx_rh_quality_score` (`repair_quality_score`),
  KEY `idx_rh_repeat_damage` (`repeat_damage_within_12_months`),
  KEY `idx_rh_warranty_repair` (`is_warranty_repair`),
  KEY `idx_rh_fraud_flagged` (`is_fraud_flagged`),
  KEY `idx_rh_tenant` (`tenant_id`),
  CONSTRAINT `restore_fk_repair_history_fk_repair_history_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=5700001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `replay_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `replay_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_snapshot_id` int DEFAULT NULL,
  `original_snapshot_version` int NOT NULL,
  `original_verdict` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `new_verdict` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed` tinyint NOT NULL DEFAULT '0',
  `differences_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `impact_analysis` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `replay_result_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `replayed_at` bigint NOT NULL,
  `replayed_by_user_id` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lifecycle_state_at_replay` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_rl_claim` (`claim_id`),
  KEY `idx_rl_tenant` (`tenant_id`),
  KEY `idx_rl_replayed_at` (`replayed_at`),
  KEY `idx_rl_changed` (`changed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_access_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_access_audit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_type` enum('pdf','interactive') COLLATE utf8mb4_unicode_ci NOT NULL,
  `accessed_by` int NOT NULL,
  `access_type` enum('view','download','export','create') COLLATE utf8mb4_unicode_ci NOT NULL,
  `accessed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_report_id` (`report_id`),
  KEY `idx_accessed_by` (`accessed_by`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_accessed_at` (`accessed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_audit_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `job_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `claim_id` int DEFAULT NULL,
  `tenant_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performed_by_user_id` int NOT NULL,
  `performed_by_user_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_report_audit_user` (`performed_by_user_id`),
  KEY `idx_report_audit_claim` (`claim_id`),
  KEY `idx_report_audit_created` (`created_at`),
  CONSTRAINT `restore_fk_report_audit_log_fk_report_audit_log_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_definitions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `required_roles` json NOT NULL,
  `sensitivity` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `scope` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `output_formats` json NOT NULL,
  `is_schedulable` tinyint(1) NOT NULL DEFAULT '0',
  `pii_fields` json DEFAULT NULL,
  `retention_days` int NOT NULL DEFAULT '90',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` bigint NOT NULL DEFAULT '0',
  `updated_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `report_key` (`report_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_jobs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'queued',
  `requested_by_user_id` int NOT NULL,
  `tenant_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `output_format` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pdf',
  `s3_key` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `download_url` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `download_url_expires_at` bigint DEFAULT NULL,
  `download_count` int NOT NULL DEFAULT '0',
  `last_downloaded_at` bigint DEFAULT NULL,
  `last_downloaded_by` int DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` bigint DEFAULT NULL,
  `completed_at` bigint DEFAULT NULL,
  `expires_at` bigint DEFAULT NULL,
  `file_size_bytes` int DEFAULT NULL,
  `page_count` int DEFAULT NULL,
  `row_count` int DEFAULT NULL,
  `created_at` bigint NOT NULL DEFAULT '0',
  `updated_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `job_id` (`job_id`),
  KEY `idx_report_jobs_status` (`status`),
  KEY `idx_report_jobs_user` (`requested_by_user_id`),
  KEY `idx_report_jobs_tenant` (`tenant_id`),
  KEY `idx_report_jobs_key` (`report_key`),
  KEY `idx_report_jobs_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_links`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_links` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `snapshot_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `interactive_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `access_token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_code_data` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_snapshot_id` (`snapshot_id`),
  KEY `idx_access_token` (`access_token`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_provenance_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_provenance_snapshots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `job_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `generator_version` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `input_snapshot` json NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `report_provenance_snapshots_job_id_uq` (`job_id`),
  KEY `report_provenance_snapshots_tenant_claim_idx` (`tenant_id`,`claim_id`),
  KEY `report_provenance_snapshots_hash_idx` (`input_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `schedule_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `schedule_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parameters` json DEFAULT NULL,
  `output_format` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pdf',
  `frequency` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `day_of_week` tinyint DEFAULT NULL,
  `day_of_month` tinyint DEFAULT NULL,
  `hour_of_day` tinyint NOT NULL DEFAULT '6',
  `delivery_emails` json NOT NULL,
  `delivery_subject` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_run_at` bigint DEFAULT NULL,
  `last_run_status` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `next_run_at` bigint DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` bigint NOT NULL DEFAULT '0',
  `updated_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `schedule_id` (`schedule_id`),
  KEY `idx_report_schedules_tenant` (`tenant_id`),
  KEY `idx_report_schedules_next` (`next_run_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_snapshots` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `version` int NOT NULL,
  `report_type` enum('insurer','assessor','regulatory') COLLATE utf8mb4_unicode_ci NOT NULL,
  `intelligence_data` json NOT NULL,
  `audit_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `generated_by` int NOT NULL,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_immutable` tinyint(1) NOT NULL DEFAULT '1',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_version` (`claim_id`,`version`),
  KEY `idx_audit_hash` (`audit_hash`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_generated_by` (`generated_by`),
  CONSTRAINT `restore_fk_report_snapshots_fk_report_snapshots_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `risk_register`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `risk_register` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `risk_type` enum('fraud','cost_overrun','compliance','operational') COLLATE utf8mb4_unicode_ci NOT NULL,
  `likelihood` int NOT NULL,
  `impact` int NOT NULL,
  `risk_score` int NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `treatment_plan` enum('accept','mitigate','transfer','avoid') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `treatment_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `identified_by` int NOT NULL,
  `identified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `status` enum('open','mitigated','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_risk_register_claim_id` (`claim_id`),
  KEY `idx_risk_register_tenant_id` (`tenant_id`),
  CONSTRAINT `restore_fk_risk_register_fk_risk_register_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `role_assignment_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_assignment_audit` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `previous_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by_user_id` int NOT NULL,
  `justification` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_changed_by` (`changed_by_user_id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_role_audit_user_time` (`user_id`,`timestamp`),
  KEY `idx_role_audit_tenant_time` (`tenant_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8580001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `routing_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `routing_history` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `confidence_score` decimal(5,2) NOT NULL,
  `confidence_components` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `routing_category` enum('HIGH','MEDIUM','LOW') COLLATE utf8mb4_unicode_ci NOT NULL,
  `routing_decision` enum('AI_FAST_TRACK','INTERNAL_REVIEW','EXTERNAL_REQUIRED','MANUAL_OVERRIDE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `threshold_config_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1.0',
  `model_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'v1.0',
  `decided_by` enum('AI','USER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `decided_by_user_id` int DEFAULT NULL,
  `justification` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `explainability_metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `routing_version` int NOT NULL DEFAULT '1',
  `threshold_snapshot` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_routing_claim_id` (`claim_id`),
  KEY `idx_routing_tenant_id` (`tenant_id`),
  KEY `idx_routing_timestamp` (`timestamp`),
  KEY `idx_routing_claim_tenant` (`claim_id`,`tenant_id`),
  CONSTRAINT `restore_fk_routing_history_fk_routing_history_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `routing_threshold_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `routing_threshold_config` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `high_threshold` decimal(5,2) NOT NULL,
  `medium_threshold` decimal(5,2) NOT NULL,
  `ai_fast_track_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_threshold_tenant_version` (`tenant_id`,`version`),
  KEY `idx_threshold_tenant_id` (`tenant_id`),
  KEY `idx_threshold_active` (`is_active`),
  KEY `idx_threshold_tenant_active` (`tenant_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_providers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_providers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `provider_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_type` enum('panel_beater','mechanic','dealership','specialist') COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_person` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `specializations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certifications` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `average_rating` decimal(3,2) DEFAULT NULL,
  `total_jobs_completed` int DEFAULT '0',
  `average_completion_time` decimal(6,2) DEFAULT NULL,
  `average_cost_deviation` decimal(5,2) DEFAULT NULL,
  `on_time_completion_rate` decimal(5,2) DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  `is_verified` tinyint DEFAULT '0',
  `verified_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `provider_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quoted_amount` int NOT NULL,
  `labor_cost` int DEFAULT NULL,
  `parts_cost` int DEFAULT NULL,
  `additional_costs` int DEFAULT NULL,
  `estimated_duration` int DEFAULT NULL,
  `availability_date` timestamp NULL DEFAULT NULL,
  `completion_date` timestamp NULL DEFAULT NULL,
  `quote_line_items` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `parts_required` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `provider_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider_rating` decimal(3,2) DEFAULT NULL,
  `provider_completed_jobs` int DEFAULT NULL,
  `ai_cost_score` int DEFAULT NULL,
  `cost_deviation_percent` decimal(5,2) DEFAULT NULL,
  `recommendation_score` int DEFAULT NULL,
  `status` enum('pending','accepted','rejected','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `valid_until` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `service_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `fleet_id` int DEFAULT NULL,
  `owner_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `request_type` enum('maintenance','repair','inspection','emergency') COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_category` enum('engine','transmission','brakes','suspension','electrical','bodywork','tires','hvac','general') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `urgency` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `current_mileage` int DEFAULT NULL,
  `problem_images` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `diagnostic_codes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','quotes_received','quote_accepted','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'open',
  `quotes_received` int DEFAULT '0',
  `selected_quote_id` int DEFAULT NULL,
  `selected_provider_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `requires_approval` tinyint NOT NULL DEFAULT '1',
  `approval_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `approved_by` int DEFAULT NULL COMMENT 'fleet_manager user ID',
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_by` int NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `shadow_override_monitor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `shadow_override_monitor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tenant_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default',
  `overrides_24h` int NOT NULL DEFAULT '0',
  `overrides_7d` int NOT NULL DEFAULT '0',
  `overrides_30d` int NOT NULL DEFAULT '0',
  `total_overrides` int NOT NULL DEFAULT '0',
  `unusual_pattern_detected` tinyint(1) NOT NULL DEFAULT '0',
  `pattern_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `override_activity_detected` tinyint(1) NOT NULL DEFAULT '0',
  `recommended_action` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `mode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'shadow',
  `last_scanned_at` bigint NOT NULL,
  `first_override_at` bigint DEFAULT NULL,
  `last_override_at` bigint DEFAULT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_som_user` (`user_id`),
  KEY `idx_som_tenant` (`tenant_id`),
  KEY `idx_som_scanned` (`last_scanned_at`),
  KEY `idx_som_activity` (`override_activity_detected`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `similar_claims_clusters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `similar_claims_clusters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `damage_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_severity` enum('minor','moderate','severe','total_loss') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cluster_id` int DEFAULT NULL,
  `cluster_size` int DEFAULT NULL,
  `similar_claims` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cluster_median_cost` decimal(10,2) DEFAULT NULL,
  `cluster_average_cost` decimal(10,2) DEFAULT NULL,
  `cluster_std_dev` decimal(10,2) DEFAULT NULL,
  `similarity_threshold` decimal(5,2) DEFAULT NULL,
  `k_neighbors` int DEFAULT NULL,
  `clustered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `clustering_algorithm` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `super_audit_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `super_audit_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `super_admin_user_id` int NOT NULL,
  `super_admin_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `audited_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `impersonated_role` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `session_ended_at` timestamp NULL DEFAULT NULL,
  `session_duration_seconds` int DEFAULT NULL,
  `accessed_claim_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accessed_dashboards` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `replayed_claim_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `viewed_ai_scoring_claim_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `viewed_routing_logic_claim_ids` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_super_audit_sessions_super_admin_user_id` (`super_admin_user_id`),
  KEY `idx_super_audit_sessions_audited_tenant_id` (`audited_tenant_id`),
  KEY `idx_super_audit_sessions_session_started_at` (`session_started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `supplier_performance_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_performance_metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_country` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_quotes_submitted` int DEFAULT '0',
  `total_quotes_approved` int DEFAULT '0',
  `total_quotes_rejected` int DEFAULT '0',
  `avg_price_vs_market` decimal(5,2) DEFAULT NULL,
  `avg_extraction_confidence` decimal(5,2) DEFAULT NULL,
  `first_quote_date` date DEFAULT NULL,
  `last_quote_date` date DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `supplier_performance_metrics_supplier_name_unique` (`supplier_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `supplier_quote_line_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_quote_line_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_id` int NOT NULL,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year_from` int DEFAULT NULL,
  `vehicle_year_to` int DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `part_type` enum('OEM','OEM_Equivalent','Aftermarket','Used','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Unknown',
  `quantity` int DEFAULT '1',
  `approved` tinyint(1) DEFAULT '0',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `extracted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `line_number` int DEFAULT NULL,
  `shipping_cost` decimal(10,2) DEFAULT NULL,
  `customs_duty` decimal(10,2) DEFAULT NULL,
  `clearing_fees` decimal(10,2) DEFAULT NULL,
  `forex_charges` decimal(10,2) DEFAULT NULL,
  `lead_time_days` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `supplier_quotes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `supplier_quotes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_country` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `supplier_contact` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_date` date NOT NULL,
  `quote_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quote_valid_until` date DEFAULT NULL,
  `document_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `document_type` enum('pdf','excel','image') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `extracted_at` timestamp NULL DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int DEFAULT NULL,
  `extraction_confidence` decimal(5,2) DEFAULT NULL,
  `extraction_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `uploaded_by` int NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `system_errors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_errors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `procedure_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stack_trace` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_se_procedure` (`procedure_name`),
  KEY `idx_se_user_id` (`user_id`),
  KEY `idx_se_occurred_at` (`occurred_at`),
  KEY `idx_se_error_code` (`error_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver') COLLATE utf8mb4_unicode_ci NOT NULL,
  `insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL,
  `accepted_at` timestamp NULL DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `tenant_id_idx` (`tenant_id`),
  KEY `email_idx` (`email`),
  KEY `token_idx` (`token`),
  KEY `expires_at_idx` (`expires_at`),
  UNIQUE KEY `token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_isolation_violations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_isolation_violations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `user_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `procedure_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `occurred_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_tiv_user_id` (`user_id`),
  KEY `idx_tiv_user_tenant` (`user_tenant_id`),
  KEY `idx_tiv_occurred_at` (`occurred_at`),
  KEY `idx_tiv_procedure` (`procedure_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8040001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_role_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_role_configs` (
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_key` enum('executive','claims_manager','claims_processor','assessor_internal','assessor_external','risk_manager','insurer_admin','recovery_officer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint NOT NULL DEFAULT '1',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `permissions` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`,`role_key`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenant_workflow_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenant_workflow_configs` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `require_executive_approval_above` decimal(10,2) DEFAULT '50000.00',
  `require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
  `auto_approve_below` decimal(10,2) DEFAULT '5000.00',
  `fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
  `require_internal_assessment` tinyint NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `tenants` (
  `id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tier` enum('tier-basic','tier-professional','tier-enterprise') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tier-basic',
  `status` enum('active','suspended','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `encryption_key_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact_phone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `billing_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_json` json DEFAULT NULL,
  `workflow_config` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `intake_escalation_hours` int DEFAULT '6',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `activated_at` timestamp NULL DEFAULT NULL,
  `suspended_at` timestamp NULL DEFAULT NULL,
  `intake_escalation_enabled` tinyint NOT NULL DEFAULT '0',
  `intake_escalation_mode` enum('auto_assign','escalate_only') COLLATE utf8mb4_unicode_ci DEFAULT 'escalate_only',
  `ai_rerun_limit_per_hour` int NOT NULL DEFAULT '10',
  `currency_code` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'USD',
  `currency_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT '$',
  `country` varchar(2) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ISO 3166-1 alpha-2 country code',
  `kinga_sequence` int NOT NULL DEFAULT '0',
  `kinga_sequence_year` int NOT NULL DEFAULT '0',
  `is_synthetic_tenant` tinyint NOT NULL DEFAULT '0',
  `workos_organization_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  KEY `idx_tenants_name` (`name`),
  KEY `idx_tenants_status` (`status`),
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `tenants_workos_organization_id_unique` (`workos_organization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `third_party_vehicles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `third_party_vehicles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year` int DEFAULT NULL,
  `registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vin` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_contact` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `owner_address` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `driver_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `driver_license` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `insurance_company` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `policy_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_photos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_repair_cost` int DEFAULT NULL,
  `market_value` int DEFAULT NULL,
  `market_value_source` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `market_value_confidence` enum('low','medium','high') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `liability_percentage` int DEFAULT '0',
  `compensation_amount` int DEFAULT NULL,
  `compensation_type` enum('repair','cash','total_loss') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_third_party_vehicles_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_third_party_vehicles_fk_third_party_vehicles_clai` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `training_data_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `training_data_scores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `training_confidence_score` decimal(5,2) NOT NULL,
  `training_confidence_category` enum('HIGH','MEDIUM','LOW') COLLATE utf8mb4_unicode_ci NOT NULL,
  `assessor_report_score` decimal(5,2) DEFAULT '0.00',
  `supporting_photos_score` decimal(5,2) DEFAULT '0.00',
  `panel_beater_quotes_score` decimal(5,2) DEFAULT '0.00',
  `evidence_completeness_score` decimal(5,2) DEFAULT '0.00',
  `handwritten_adjustments_score` decimal(5,2) DEFAULT '0.00',
  `fraud_markers_score` decimal(5,2) DEFAULT '0.00',
  `dispute_history_score` decimal(5,2) DEFAULT '0.00',
  `competing_quotes_score` decimal(5,2) DEFAULT '0.00',
  `scoring_algorithm_version` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scoring_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `anomaly_detected` tinyint DEFAULT '0',
  `anomaly_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bias_risk_detected` tinyint DEFAULT '0',
  `bias_risk_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scored_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `training_data_scores_historical_claim_id_unique` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `training_dataset`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `training_dataset` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dataset_version` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `included_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `included_by` int NOT NULL,
  `inclusion_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `used_in_model_versions` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_used_for_training` timestamp NULL DEFAULT NULL,
  `is_active` tinyint DEFAULT '1',
  `deactivated_at` timestamp NULL DEFAULT NULL,
  `deactivation_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `training_weight` decimal(3,2) DEFAULT '1.00',
  `negotiated_adjustment` tinyint DEFAULT '0',
  `deviation_reason` enum('none','negotiation','fraud','regional_variance','data_quality','assessor_bias','manual_override') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `training_dataset_historical_claim_id_unique` (`historical_claim_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `training_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `training_records` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `training_type` enum('fraud_detection','iso_compliance','role_onboarding') COLLATE utf8mb4_unicode_ci NOT NULL,
  `completion_date` timestamp NOT NULL,
  `expiry_date` timestamp NULL DEFAULT NULL,
  `trainer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessment_score` decimal(5,2) DEFAULT NULL,
  `certificate_url` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_training_records_user_id` (`user_id`),
  KEY `idx_training_records_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `usage_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `usage_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `claim_id` int DEFAULT NULL,
  `event_type` enum('CLAIM_PROCESSED','AI_EVALUATED','FAST_TRACK_TRIGGERED','AUTO_APPROVED','ASSESSOR_TOOL_USED','FLEET_VEHICLE_ACTIVE','AGENCY_POLICY_BOUND','AI_ASSESSMENT_TRIGGERED','DOCUMENT_INGESTED','EXECUTIVE_ANALYTICS_QUERY','GOVERNANCE_CHECK','FLEET_VEHICLE_MANAGED','MARKETPLACE_QUOTE_REQUEST') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reference_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` int DEFAULT NULL COMMENT 'User who triggered the event',
  `resource_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Type of resource (claim, document, vehicle, etc.)',
  `compute_units` decimal(10,4) DEFAULT '1.0000' COMMENT 'Normalized compute cost',
  `processing_time_ms` int DEFAULT NULL COMMENT 'Processing duration in milliseconds',
  `estimated_cost` decimal(10,4) DEFAULT NULL COMMENT 'Estimated cost in cents',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `tenant_idx` (`tenant_id`),
  KEY `claim_idx` (`claim_id`),
  KEY `event_type_idx` (`event_type`),
  KEY `timestamp_idx` (`timestamp`),
  KEY `reference_idx` (`reference_id`),
  CONSTRAINT `restore_fk_usage_events_fk_usage_events_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=8160001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `organization_id` int NOT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('insurer','assessor') COLLATE utf8mb4_unicode_ci NOT NULL,
  `invited_by` int NOT NULL,
  `invitation_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','accepted','expired','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `accepted_at` timestamp NULL DEFAULT NULL,
  `accepted_user_id` int DEFAULT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `invitation_token` (`invitation_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `openId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(320) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `loginMethod` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver','agency','engineer') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `organization_id` int DEFAULT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_verified` tinyint NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assessor_tier` enum('free','premium','enterprise') COLLATE utf8mb4_unicode_ci DEFAULT 'free',
  `tier_activated_at` timestamp NULL DEFAULT NULL,
  `tier_expires_at` timestamp NULL DEFAULT NULL,
  `performance_score` int DEFAULT '70',
  `total_assessments_completed` int DEFAULT '0',
  `average_variance_from_final` int DEFAULT NULL,
  `accuracy_score` decimal(5,2) DEFAULT '0.00',
  `avg_completion_time` decimal(6,2) DEFAULT '0.00',
  `insurerRole` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marketplace_profile_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `deactivated_at` timestamp NULL DEFAULT NULL,
  `secondary_roles` json DEFAULT NULL COMMENT 'Additional roles this user holds, e.g. ["claimant","fleet_driver"]',
  `default_role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_qa_account` tinyint DEFAULT '0',
  `phone_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_unregistered_claimant` tinyint NOT NULL DEFAULT '0',
  `workos_user_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `users_openId_unique` (`openId`),
  KEY `idx_users_tenant_id` (`tenant_id`),
  KEY `idx_users_marketplace_profile_id` (`marketplace_profile_id`),
  KEY `idx_users_is_active` (`is_active`),
  KEY `idx_users_name_prefix` (`name`(100)),
  KEY `idx_users_phone_tenant` (`phone_number`,`tenant_id`),
  UNIQUE KEY `users_workos_user_id_unique` (`workos_user_id`),
  CONSTRAINT `restore_fk_users_fk_users_marketplace_profile` FOREIGN KEY (`marketplace_profile_id`) REFERENCES `marketplace_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=36300001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `valuation_comparable_evidence`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_comparable_evidence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `valuation_request_id` int NOT NULL,
  `source_type` enum('market_valuation_record','historical_claim') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_reference` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observed_value_cents` int NOT NULL,
  `observed_at` timestamp NULL DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vehicle_match_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `adjustment_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `limitation` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inclusion_status` enum('included','excluded','review_required') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'included',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `valuation_comparable_request_idx` (`valuation_request_id`),
  KEY `valuation_comparable_source_idx` (`source_type`,`source_reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `variance_datasets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `variance_datasets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `historical_claim_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `comparison_type` enum('quote_vs_final','ai_vs_final','assessor_vs_final','quote_vs_assessor','ai_vs_assessor','quote_vs_ai') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_a_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_a_amount` decimal(12,2) NOT NULL,
  `source_b_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_b_amount` decimal(12,2) NOT NULL,
  `variance_amount` decimal(12,2) NOT NULL,
  `variance_percent` decimal(8,2) NOT NULL,
  `absolute_variance_percent` decimal(8,2) NOT NULL,
  `labor_variance` decimal(12,2) DEFAULT NULL,
  `parts_variance` decimal(12,2) DEFAULT NULL,
  `paint_variance` decimal(12,2) DEFAULT NULL,
  `variance_category` enum('within_threshold','minor_variance','significant_variance','major_variance','extreme_variance') COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `accident_type` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_license_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_fraud_suspected` tinyint DEFAULT '0',
  `is_outlier` tinyint DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_vd_claim` (`historical_claim_id`),
  KEY `idx_vd_tenant` (`tenant_id`),
  KEY `idx_vd_type` (`comparison_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_condition_assessment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_condition_assessment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `assessor_id` int NOT NULL,
  `speedo_reading` int DEFAULT NULL,
  `speedo_unit` enum('km','miles') COLLATE utf8mb4_unicode_ci DEFAULT 'km',
  `brakes_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brakes_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `steering_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `steering_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tires_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tire_tread_depth_mm` int DEFAULT NULL,
  `tires_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suspension_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suspension_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bodywork_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bodywork_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paintwork_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `paintwork_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upholstery_condition` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `upholstery_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `general_mechanical` enum('good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mechanical_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `radio_present` tinyint DEFAULT '1',
  `radio_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `token_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `overall_condition` enum('excellent','good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_level` enum('well_maintained','average','poorly_maintained') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `has_contributory_negligence` tinyint DEFAULT '0',
  `negligence_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition_photos` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessment_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assessor_signature` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_vehicle_condition_assessment_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_vehicle_condition_assessment_fk_vehicle_condition` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_condition_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_condition_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_registry_id` int NOT NULL,
  `insurance_service_request_id` int NOT NULL,
  `vehicle_market_valuation_id` int DEFAULT NULL,
  `snapshot_version` int NOT NULL,
  `snapshot_date` timestamp NOT NULL,
  `exterior_condition` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `interior_condition` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mechanical_condition` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `existing_damage_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tyre_condition` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `glass_condition` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `odometer_km` int DEFAULT NULL,
  `modifications_json` json DEFAULT NULL,
  `photographs_json` json DEFAULT NULL,
  `evidence_sources_json` json NOT NULL,
  `observations` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assessor_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `captured_by` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_vehicle_condition_snapshot_version` (`insurance_service_request_id`,`snapshot_version`),
  KEY `idx_vehicle_condition_snapshot_vehicle_date` (`vehicle_registry_id`,`snapshot_date`),
  KEY `idx_vehicle_condition_snapshot_tenant_vehicle` (`tenant_id`,`vehicle_registry_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=690001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_damage_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_damage_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `claim_id` int DEFAULT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_zone` enum('front','rear','left','right','roof','undercarriage','multiple','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `damaged_components_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `affected_zones_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `impact_direction` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `impact_force_kn` decimal(8,2) DEFAULT NULL,
  `estimated_speed_kmh` decimal(6,1) DEFAULT NULL,
  `severity` enum('minor','moderate','severe','total_loss','unknown') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  `has_structural_damage` tinyint NOT NULL DEFAULT '0',
  `airbags_deployed` tinyint NOT NULL DEFAULT '0',
  `repair_cost_estimate_cents` int NOT NULL DEFAULT '0',
  `actual_repair_cost_cents` int DEFAULT NULL,
  `repairer_id` int DEFAULT NULL,
  `repairer_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `repair_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fraud_risk_score` int NOT NULL DEFAULT '0',
  `is_repeat_zone` tinyint NOT NULL DEFAULT '0',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_vdh_vehicle_id` (`vehicle_id`),
  KEY `idx_vdh_claim_id` (`claim_id`),
  KEY `idx_vdh_damage_zone` (`damage_zone`),
  KEY `idx_vdh_severity` (`severity`),
  KEY `idx_vdh_tenant` (`tenant_id`),
  KEY `idx_vdh_repairer` (`repairer_id`),
  KEY `idx_vdh_repeat_zone` (`is_repeat_zone`),
  KEY `idx_vdh_vehicle_reg` (`vehicle_registration`),
  CONSTRAINT `restore_fk_vehicle_damage_history_fk_vehicle_damage_history_` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=630001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_geometry_measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_geometry_measurements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_model_id` int NOT NULL,
  `measurement_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_mm` decimal(10,2) NOT NULL,
  `unit` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mm',
  `confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
  `source_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_1` (`vehicle_model_id`),
  CONSTRAINT `restore_fk_vehicle_geometry_measurements_fk_1` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_year` int DEFAULT NULL,
  `vin` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `current_owner_id` int DEFAULT NULL,
  `ownership_change_count` int DEFAULT '0',
  `ownership_history` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_claims` int DEFAULT '0',
  `total_claim_amount` int DEFAULT '0',
  `last_claim_date` timestamp NULL DEFAULT NULL,
  `has_pre_existing_damage` tinyint DEFAULT '0',
  `is_salvage_title` tinyint DEFAULT '0',
  `has_odometer_fraud` tinyint DEFAULT '0',
  `is_stolen` tinyint DEFAULT '0',
  `unique_drivers_count` int DEFAULT '0',
  `non_owner_accident_count` int DEFAULT '0',
  `driver_history` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `risk_score` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `vehicle_registration` (`vehicle_registration`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_landmarks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_landmarks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_model_id` int NOT NULL,
  `landmark_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `x_mm` decimal(10,2) DEFAULT NULL,
  `y_mm` decimal(10,2) DEFAULT NULL,
  `z_mm` decimal(10,2) DEFAULT NULL,
  `reference_frame` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VVCS',
  `confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
  `source_type` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_1` (`vehicle_model_id`),
  CONSTRAINT `restore_fk_vehicle_landmarks_fk_1` FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_market_valuations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_market_valuations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int DEFAULT NULL,
  `vehicle_make` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vehicle_year` int NOT NULL,
  `vehicle_registration` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mileage` int DEFAULT NULL,
  `condition` enum('excellent','good','fair','poor') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `estimated_market_value` int NOT NULL,
  `valuation_method` enum('facebook_marketplace','classifieds','autotrader_sa','historical_claims','manual_assessor','ai_estimation','hybrid') COLLATE utf8mb4_unicode_ci NOT NULL,
  `facebook_prices` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `classifieds_prices` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `autotrader_sa_prices` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sa_base_price` int DEFAULT NULL,
  `import_duty_percent` decimal(5,2) DEFAULT NULL,
  `import_duty_amount` int DEFAULT NULL,
  `transport_cost` int DEFAULT NULL,
  `total_import_cost` int DEFAULT NULL,
  `confidence_score` int DEFAULT NULL,
  `data_points_count` int DEFAULT NULL,
  `price_range` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `condition_adjustment` int DEFAULT NULL,
  `mileage_adjustment` int DEFAULT NULL,
  `market_trend_adjustment` int DEFAULT NULL,
  `final_adjusted_value` int DEFAULT NULL,
  `is_total_loss` tinyint DEFAULT '0',
  `total_loss_threshold` decimal(5,2) DEFAULT '60.00',
  `repair_cost_to_value_ratio` decimal(5,2) DEFAULT NULL,
  `assessor_override` tinyint DEFAULT '0',
  `assessor_value` int DEFAULT NULL,
  `assessor_justification` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `valuation_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `valid_until` timestamp NULL DEFAULT NULL,
  `valued_by` int DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `quotation_request_id` int DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_vehicle_market_valuations_claim_id` (`claim_id`),
  CONSTRAINT `restore_fk_vehicle_market_valuations_fk_vehicle_market_valua` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=12870001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_mileage_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_mileage_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `tenant_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mileage` int NOT NULL,
  `recorded_date` timestamp NOT NULL,
  `recorded_by` int NOT NULL,
  `record_type` enum('manual','service','inspection','claim','automated') COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_models`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_models` (
  `id` int NOT NULL AUTO_INCREMENT,
  `manufacturer` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `variant` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generation` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year_from` int NOT NULL,
  `year_to` int DEFAULT NULL,
  `body_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `market_region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `completeness_score` decimal(4,3) DEFAULT '0.000',
  `profile_cache_json` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=120001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_passport_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_passport_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vehicle_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passport_json` json NOT NULL,
  `risk_score` int NOT NULL DEFAULT '0',
  `risk_tier` enum('low','medium','high','critical') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low',
  `data_completeness` int NOT NULL DEFAULT '0',
  `computed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_vps_vehicle_id` (`vehicle_id`),
  KEY `idx_vps_tenant` (`tenant_id`),
  KEY `idx_vps_risk_tier` (`risk_tier`),
  KEY `idx_vps_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vehicle_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vehicle_registry` (
  `id` int NOT NULL AUTO_INCREMENT,
  `vin` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `registration_number` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `make` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `year` int DEFAULT NULL,
  `color` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `engine_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_type` enum('sedan','suv','pickup','van','hatchback','coupe','bus','truck','motorcycle','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `engine_capacity` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fuel_type` enum('petrol','diesel','electric','hybrid','lpg','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `powertrain_type` enum('ICE','HEV','BEV','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vehicle_mass_kg` int DEFAULT NULL,
  `vehicle_mass_source` enum('explicit','inferred_model','inferred_class','not_available') COLLATE utf8mb4_unicode_ci DEFAULT 'not_available',
  `current_owner_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_registration_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `licence_expiry_date` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total_claims_count` int NOT NULL DEFAULT '0',
  `total_repair_cost_cents` int NOT NULL DEFAULT '0',
  `last_claim_date` timestamp NULL DEFAULT NULL,
  `claim_ids_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `damage_zone_counts_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `has_suspicious_damage_pattern` tinyint NOT NULL DEFAULT '0',
  `is_repeat_claimer` tinyint NOT NULL DEFAULT '0',
  `is_salvage_title` tinyint NOT NULL DEFAULT '0',
  `is_stolen` tinyint NOT NULL DEFAULT '0',
  `is_written_off` tinyint NOT NULL DEFAULT '0',
  `vehicle_risk_score` int NOT NULL DEFAULT '0',
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `idx_vehicle_registry_vin` (`vin`),
  KEY `idx_vehicle_registry_registration` (`registration_number`),
  KEY `idx_vehicle_registry_make_model` (`make`,`model`),
  KEY `idx_vehicle_registry_tenant` (`tenant_id`),
  KEY `idx_vehicle_registry_risk_score` (`vehicle_risk_score`),
  KEY `idx_vehicle_registry_repeat_claimer` (`is_repeat_claimer`),
  KEY `idx_vr_tenant_reg_number` (`tenant_id`,`registration_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2010001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `vision_calibration_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `vision_calibration_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assessment_id` int DEFAULT NULL,
  `image_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_index` int DEFAULT NULL,
  `vehicle_model_id` int DEFAULT NULL,
  `reference_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pixel_measurement` decimal(10,2) DEFAULT NULL,
  `physical_measurement_mm` decimal(10,2) DEFAULT NULL,
  `scale_mm_per_pixel` decimal(10,4) DEFAULT NULL,
  `perspective_correction_method` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `confidence` decimal(4,3) DEFAULT NULL,
  `failure_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `calibrated_crush_depth_m` decimal(6,4) DEFAULT NULL,
  `calibrated_crush_depth_min_m` decimal(6,4) DEFAULT NULL,
  `calibrated_crush_depth_max_m` decimal(6,4) DEFAULT NULL,
  `geometry_evidence_json` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `weight_adjustment_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `weight_adjustment_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `mismatch_type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_multiplier` decimal(7,4) NOT NULL,
  `raw_multiplier` decimal(7,4) NOT NULL,
  `new_multiplier` decimal(7,4) NOT NULL,
  `total_annotations` int NOT NULL,
  `confirmation_rate` decimal(6,4) NOT NULL,
  `sensitivity_direction` enum('increase','decrease') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_wal_type` (`mismatch_type`),
  KEY `idx_wal_created_at` (`created_at`),
  KEY `idx_wal_direction` (`sensitivity_direction`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `whatsapp_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `whatsapp_sessions` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'UUID session identifier',
  `phone_number` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Client WhatsApp number in E.164 format',
  `intent` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CLAIM | QUOTE | VALUATION | STATUS',
  `state` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IDLE' COMMENT 'Current conversation state',
  `data` json DEFAULT NULL COMMENT 'All collected journey data',
  `photo_urls` json DEFAULT NULL COMMENT 'Array of S3 URLs for uploaded photos',
  `status` enum('active','paused','submitted','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `resume_context` text COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Human-readable context for session resume message',
  `last_message_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_wa_phone` (`phone_number`),
  KEY `idx_wa_status` (`status`),
  KEY `idx_wa_last_msg` (`last_message_at`),
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_audit_trail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_audit_trail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `user_id` int NOT NULL,
  `user_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `decision_value` int DEFAULT NULL,
  `ai_score` int DEFAULT NULL,
  `confidence_score` int DEFAULT NULL,
  `comments` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `metadata` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `executive_override` int DEFAULT '0',
  `override_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_workflow_audit_claim_state_time` (`claim_id`,`new_state`,`created_at`),
  KEY `idx_workflow_audit_override` (`executive_override`,`created_at`),
  KEY `idx_audit_claim_timestamp` (`claim_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=14520001;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_configuration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_configuration` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `risk_manager_enabled` tinyint NOT NULL DEFAULT '1',
  `high_value_threshold` int NOT NULL DEFAULT '1000000',
  `executive_review_threshold` int NOT NULL DEFAULT '5000000',
  `ai_fast_track_enabled` tinyint NOT NULL DEFAULT '0',
  `external_assessor_enabled` tinyint NOT NULL DEFAULT '1',
  `max_sequential_stages_by_user` int NOT NULL DEFAULT '2',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_states`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_states` (
  `id` int NOT NULL AUTO_INCREMENT,
  `claim_id` int NOT NULL,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_state` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_state` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transitioned_by` int NOT NULL,
  `transitioned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_claim_id` (`claim_id`),
  KEY `idx_tenant_id` (`tenant_id`),
  CONSTRAINT `restore_fk_workflow_states_fk_workflow_states_claim_id` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `workflow_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stages_json` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `applies_to_json` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint NOT NULL DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_wt_tenant_id` (`tenant_id`),
  KEY `idx_wt_is_default` (`tenant_id`,`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

