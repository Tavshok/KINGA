CREATE TABLE `fast_track_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`product_id` int,
	`claim_type` enum('collision','theft','hail','fire','vandalism','flood','hijacking','other'),
	`fast_track_action` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT') NOT NULL,
	`min_confidence_score` decimal(5,2) NOT NULL,
	`max_claim_value` int NOT NULL,
	`max_fraud_score` decimal(5,2) NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`version` int NOT NULL,
	`effective_from` timestamp NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fast_track_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fast_track_routing_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`config_id` int,
	`config_version` int,
	`eligible` tinyint NOT NULL,
	`decision` enum('AUTO_APPROVE','PRIORITY_QUEUE','REDUCED_DOCUMENTATION','STRAIGHT_TO_PAYMENT','MANUAL_REVIEW') NOT NULL,
	`reason` text NOT NULL,
	`confidence_score` decimal(5,2) NOT NULL,
	`claim_value` int NOT NULL,
	`fraud_score` decimal(5,2) NOT NULL,
	`claim_type` varchar(50) NOT NULL,
	`product_id` int,
	`override` tinyint NOT NULL DEFAULT 0,
	`override_by` int,
	`override_reason` text,
	`evaluated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fast_track_routing_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ft_config_tenant` ON `fast_track_config` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_product` ON `fast_track_config` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_claim_type` ON `fast_track_config` (`claim_type`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_enabled` ON `fast_track_config` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_effective` ON `fast_track_config` (`effective_from`);--> statement-breakpoint
CREATE INDEX `idx_ft_config_hierarchy` ON `fast_track_config` (`tenant_id`,`product_id`,`claim_type`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim` ON `fast_track_routing_log` (`claim_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_tenant` ON `fast_track_routing_log` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_config` ON `fast_track_routing_log` (`config_id`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_decision` ON `fast_track_routing_log` (`decision`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_evaluated` ON `fast_track_routing_log` (`evaluated_at`);--> statement-breakpoint
CREATE INDEX `idx_ft_log_claim_tenant` ON `fast_track_routing_log` (`claim_id`,`tenant_id`);