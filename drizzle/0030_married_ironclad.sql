CREATE TABLE `governance_violation_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`violation_type` enum('EXCEEDS_AUTO_APPROVAL_LIMIT','BELOW_MIN_CONFIDENCE','EXCEEDS_MAX_FRAUD_TOLERANCE','MISSING_JUSTIFICATION','INSUFFICIENT_JUSTIFICATION') NOT NULL,
	`attempted_config` text NOT NULL,
	`governance_limits_version` int NOT NULL,
	`governance_limits_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`violated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `governance_violation_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_governance_limits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`max_auto_approval_limit_global` int NOT NULL,
	`min_confidence_allowed_global` decimal(5,2) NOT NULL,
	`max_fraud_tolerance_global` decimal(5,2) NOT NULL,
	`version` int NOT NULL,
	`effective_from` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `platform_governance_limits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant` ON `governance_violation_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_user` ON `governance_violation_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_type` ON `governance_violation_log` (`violation_type`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_at` ON `governance_violation_log` (`violated_at`);--> statement-breakpoint
CREATE INDEX `idx_gov_violation_tenant_time` ON `governance_violation_log` (`tenant_id`,`violated_at`);--> statement-breakpoint
CREATE INDEX `idx_gov_limits_version` ON `platform_governance_limits` (`version`);--> statement-breakpoint
CREATE INDEX `idx_gov_limits_effective` ON `platform_governance_limits` (`effective_from`);