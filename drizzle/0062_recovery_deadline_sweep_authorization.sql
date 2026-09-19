CREATE TABLE `recovery_sweep_service_capabilities` (
  `key_id` varchar(64) NOT NULL,
  `capability` varchar(64) NOT NULL,
  `environment` varchar(64) NOT NULL,
  `secret_hash` varchar(512) NOT NULL,
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `expires_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` timestamp NULL,
  PRIMARY KEY (`key_id`),
  KEY `idx_recovery_sweep_capability_environment` (`capability`,`environment`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `recovery_sweep_leases` (
  `lease_name` varchar(64) NOT NULL,
  `holder_id` varchar(64) NULL,
  `fence` bigint unsigned NOT NULL DEFAULT 0,
  `lease_expires_at` timestamp NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lease_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `recovery_deadline_alert_outbox` (
  `id` varchar(64) NOT NULL,
  `recovery_case_id` int NOT NULL,
  `effect_key` varchar(128) NOT NULL,
  `state` enum('pending','dispatching','delivered','discarded') NOT NULL DEFAULT 'pending',
  `attempt_count` int NOT NULL DEFAULT 0,
  `next_attempt_at` timestamp NOT NULL,
  `claimed_by` varchar(64) NULL,
  `claimed_fence` bigint unsigned NULL,
  `claimed_at` timestamp NULL,
  `delivered_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `recovery_deadline_alert_outbox_case_fk`
    FOREIGN KEY (`recovery_case_id`) REFERENCES `recovery_cases` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  UNIQUE KEY `uq_recovery_deadline_alert_effect` (`recovery_case_id`,`effect_key`),
  KEY `idx_recovery_deadline_alert_outbox_due` (`state`,`next_attempt_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
