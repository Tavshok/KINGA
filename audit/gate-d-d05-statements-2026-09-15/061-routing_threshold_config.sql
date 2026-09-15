CREATE TABLE `routing_threshold_config` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`version` varchar(50) NOT NULL,
	`high_threshold` decimal(5,2) NOT NULL,
	`medium_threshold` decimal(5,2) NOT NULL,
	`ai_fast_track_enabled` tinyint NOT NULL DEFAULT 1,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`is_active` tinyint NOT NULL DEFAULT 1,
	CONSTRAINT `routing_threshold_config_id` PRIMARY KEY(`id`)
);