CREATE TABLE `tenant_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver') NOT NULL,
	`insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`token` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`tier` enum('tier-basic','tier-professional','tier-enterprise') NOT NULL DEFAULT 'tier-basic',
	`status` enum('active','suspended','cancelled') NOT NULL DEFAULT 'active',
	`encryption_key_id` varchar(255),
	`contact_name` varchar(255),
	`contact_email` varchar(255) NOT NULL,
	`contact_phone` varchar(50),
	`billing_email` varchar(255) NOT NULL,
	`config_json` json,
	`workflow_config` text,
	`intake_escalation_hours` int DEFAULT 6,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`activated_at` timestamp,
	`suspended_at` timestamp,
	`intake_escalation_enabled` tinyint NOT NULL DEFAULT 0,
	`intake_escalation_mode` enum('auto_assign','escalate_only') DEFAULT 'escalate_only',
	`ai_rerun_limit_per_hour` int NOT NULL DEFAULT 10,
	`currency_code` varchar(10) DEFAULT 'USD',
	`currency_symbol` varchar(10) DEFAULT '$',
	`country` varchar(2),
	`kinga_sequence` int NOT NULL DEFAULT 0,
	`kinga_sequence_year` int NOT NULL DEFAULT 0,
	`is_synthetic_tenant` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`phone_number` varchar(30),
	`password_hash` varchar(255),
	`loginMethod` varchar(64),
	`role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver','agency','engineer') NOT NULL DEFAULT 'user',
	`insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`organization_id` int,
	`tenant_id` varchar(64),
	`email_verified` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`assessor_tier` enum('free','premium','enterprise') DEFAULT 'free',
	`tier_activated_at` timestamp,
	`tier_expires_at` timestamp,
	`performance_score` int DEFAULT 70,
	`secondary_roles` json,
	`total_assessments_completed` int DEFAULT 0,
	`average_variance_from_final` int,
	`accuracy_score` decimal(5,2) DEFAULT '0.00',
	`avg_completion_time` decimal(6,2) DEFAULT '0.00',
	`marketplace_profile_id` varchar(36),
	`is_active` tinyint NOT NULL DEFAULT 1,
	`deactivated_at` timestamp,
	`default_role` varchar(100),
	`is_qa_account` tinyint DEFAULT 0,
	`is_unregistered_claimant` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `tenant_id_idx` ON `tenant_invitations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `tenant_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `tenant_invitations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_tenants_name` ON `tenants` (`name`);--> statement-breakpoint
CREATE INDEX `idx_tenants_status` ON `tenants` (`status`);--> statement-breakpoint
CREATE INDEX `idx_users_tenant_id` ON `users` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_users_is_active` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_users_phone_tenant` ON `users` (`phone_number`,`tenant_id`);