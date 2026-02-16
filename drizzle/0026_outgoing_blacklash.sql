CREATE TABLE `role_assignment_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`previous_role` enum('user','admin','insurer','assessor','panel_beater','claimant'),
	`new_role` enum('user','admin','insurer','assessor','panel_beater','claimant') NOT NULL,
	`previous_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin'),
	`new_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin'),
	`changed_by_user_id` int NOT NULL,
	`justification` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_assignment_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routing_history` (
	`id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`confidence_score` decimal(5,2) NOT NULL,
	`confidence_components` text NOT NULL,
	`routing_category` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`routing_decision` enum('AI_FAST_TRACK','INTERNAL_REVIEW','EXTERNAL_REQUIRED','MANUAL_OVERRIDE') NOT NULL,
	`threshold_config_version` varchar(50) NOT NULL,
	`model_version` varchar(50) NOT NULL,
	`decided_by` enum('AI','USER') NOT NULL,
	`decided_by_user_id` int,
	`justification` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routing_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tenant_role_configs` DROP INDEX `tenant_role_configs_tenant_id_role_key_unique`;--> statement-breakpoint
ALTER TABLE `tenant_role_configs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `tenant_role_configs` ADD PRIMARY KEY(`tenant_id`,`role_key`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `role_assignment_audit` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `role_assignment_audit` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_changed_by` ON `role_assignment_audit` (`changed_by_user_id`);--> statement-breakpoint
CREATE INDEX `idx_timestamp` ON `role_assignment_audit` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_routing_claim_id` ON `routing_history` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_routing_tenant_id` ON `routing_history` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_routing_timestamp` ON `routing_history` (`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_routing_claim_tenant` ON `routing_history` (`claim_id`,`tenant_id`);--> statement-breakpoint
ALTER TABLE `tenant_role_configs` DROP COLUMN `id`;