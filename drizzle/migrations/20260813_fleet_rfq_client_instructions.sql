CREATE TABLE IF NOT EXISTS `fleet_rfq_client_instructions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `quote_request_id` int NOT NULL,
  `agency_tenant_id` varchar(64) NOT NULL,
  `fleet_account_id` int NOT NULL,
  `instruction` enum('accepted','rejected') NOT NULL,
  `status` enum('requested','executed','cancelled') NOT NULL DEFAULT 'requested',
  `instructed_by` int NOT NULL,
  `executed_by` int DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `executed_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fleet_rfq_client_instruction` (`quote_request_id`),
  KEY `idx_fleet_rfq_instruction_agency_status` (`agency_tenant_id`,`status`),
  KEY `idx_fleet_rfq_instruction_fleet` (`fleet_account_id`)
);
