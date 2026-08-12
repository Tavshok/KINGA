CREATE TABLE IF NOT EXISTS `claim_intake_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(255) NOT NULL,
  `user_id` int NOT NULL,
  `idempotency_key` varchar(64) NOT NULL,
  `request_hash` varchar(64) NOT NULL,
  `channel` varchar(50) NOT NULL,
  `claim_id` int NULL,
  `status` varchar(50) NOT NULL DEFAULT 'persisted',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_claim_intake_request_actor` (`tenant_id`,`user_id`,`idempotency_key`),
  KEY `idx_claim_intake_request_claim` (`claim_id`),
  KEY `idx_claim_intake_request_tenant_status` (`tenant_id`,`status`),
  CONSTRAINT `fk_claim_intake_request_claim` FOREIGN KEY (`claim_id`) REFERENCES `claims` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
);
