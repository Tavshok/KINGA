CREATE TABLE `service_credentials` (
  `credential_id` varchar(64) NOT NULL,
  `safe_prefix` varchar(48) NOT NULL,
  `environment` varchar(32) NOT NULL,
  `principal_name` varchar(100) NOT NULL,
  `capability` enum('scheduled:intake-escalation:run','scheduled:stuck-recovery:run') NOT NULL,
  `verifier_algorithm` enum('scrypt-v1') NOT NULL,
  `salt_base64` varchar(128) NOT NULL,
  `verifier_base64` varchar(43) NOT NULL,
  `lifecycle_state` enum('pending','active','suspended','revoked','expired') NOT NULL,
  `not_before` timestamp(3) NOT NULL,
  `expires_at` timestamp(3) NOT NULL,
  `revoked_at` timestamp(3) NULL,
  `predecessor_credential_id` varchar(64) NULL,
  `successor_credential_id` varchar(64) NULL,
  `approval_reference` varchar(128) NOT NULL,
  `active_scope_key` varchar(320) GENERATED ALWAYS AS (
    CASE
      WHEN `lifecycle_state` = 'active' AND `revoked_at` IS NULL
      THEN concat(`environment`, ':', `capability`)
      ELSE NULL
    END
  ) STORED,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`credential_id`),
  UNIQUE KEY `service_credentials_active_scope_uq` (`active_scope_key`),
  KEY `service_credentials_lookup_idx` (`environment`,`capability`,`lifecycle_state`),
  KEY `service_credentials_expiry_idx` (`expires_at`),
  CONSTRAINT `service_credentials_window_ck` CHECK (`expires_at` > `not_before`),
  CONSTRAINT `service_credentials_revocation_ck` CHECK (`lifecycle_state` <> 'revoked' OR `revoked_at` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `service_credential_audit` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `credential_id` varchar(64) NOT NULL,
  `action` enum('created','activated','suspended','revoked','expired','rotated') NOT NULL,
  `outcome` enum('accepted','rejected') NOT NULL,
  `approval_reference` varchar(128) NULL,
  `correlation_reference` varchar(128) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `service_credential_audit_credential_time_idx` (`credential_id`,`created_at`),
  KEY `service_credential_audit_action_time_idx` (`action`,`created_at`),
  CONSTRAINT `service_credential_audit_credential_fk`
    FOREIGN KEY (`credential_id`) REFERENCES `service_credentials` (`credential_id`)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `scheduled_job_executions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_key` enum('intake-escalation','stuck-recovery') NOT NULL,
  `window_key` varchar(128) NOT NULL,
  `execution_id` varchar(36) NOT NULL,
  `generation` bigint unsigned NOT NULL,
  `status` enum('running','completed','failed','cancelled') NOT NULL,
  `lease_expires_at` timestamp(3) NOT NULL,
  `attempt_count` int unsigned NOT NULL DEFAULT 1,
  `takeover_count` int unsigned NOT NULL DEFAULT 0,
  `outcome_code` varchar(64) NULL,
  `started_at` timestamp(3) NOT NULL,
  `completed_at` timestamp(3) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `scheduled_job_executions_job_window_uq` (`job_key`,`window_key`),
  UNIQUE KEY `scheduled_job_executions_execution_id_uq` (`execution_id`),
  KEY `scheduled_job_executions_lease_idx` (`status`,`lease_expires_at`),
  KEY `scheduled_job_executions_fence_idx` (`job_key`,`window_key`,`execution_id`,`generation`),
  CONSTRAINT `scheduled_job_executions_generation_ck` CHECK (`generation` >= 1),
  CONSTRAINT `scheduled_job_executions_attempt_ck` CHECK (`attempt_count` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `scheduled_job_effects` (
  `effect_key` varchar(64) NOT NULL,
  `job_key` enum('intake-escalation','stuck-recovery') NOT NULL,
  `window_key` varchar(128) NOT NULL,
  `execution_id` varchar(36) NOT NULL,
  `generation` bigint unsigned NOT NULL,
  `effect_type` varchar(100) NOT NULL,
  `subject_key` varchar(160) NOT NULL,
  `payload` json NOT NULL,
  `status` enum('pending','claimed','completed','failed') NOT NULL DEFAULT 'pending',
  `attempt_count` int unsigned NOT NULL DEFAULT 0,
  `available_at` timestamp(3) NOT NULL,
  `claim_reference` varchar(64) NULL,
  `claim_expires_at` timestamp(3) NULL,
  `last_error_code` varchar(64) NULL,
  `dispatched_at` timestamp(3) NULL,
  `completed_at` timestamp(3) NULL,
  `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`effect_key`),
  UNIQUE KEY `scheduled_job_effects_job_window_uq` (`job_key`,`window_key`),
  KEY `scheduled_job_effects_dispatch_idx` (`status`,`available_at`),
  KEY `scheduled_job_effects_execution_idx` (`job_key`,`window_key`,`execution_id`,`generation`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
