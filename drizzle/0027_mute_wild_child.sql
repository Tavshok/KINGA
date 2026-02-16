CREATE TABLE `routing_threshold_config` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`version` varchar(50) NOT NULL,
	`high_threshold` decimal(5,2) NOT NULL,
	`medium_threshold` decimal(5,2) NOT NULL,
	`ai_fast_track_enabled` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `routing_threshold_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_threshold_tenant_version` UNIQUE(`tenant_id`,`version`)
);
--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_id` ON `routing_threshold_config` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_threshold_active` ON `routing_threshold_config` (`is_active`);--> statement-breakpoint
CREATE INDEX `idx_threshold_tenant_active` ON `routing_threshold_config` (`tenant_id`,`is_active`);