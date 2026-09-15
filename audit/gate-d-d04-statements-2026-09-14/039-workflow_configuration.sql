CREATE TABLE `workflow_configuration` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`risk_manager_enabled` tinyint NOT NULL DEFAULT 1,
	`high_value_threshold` int NOT NULL DEFAULT 1000000,
	`executive_review_threshold` int NOT NULL DEFAULT 5000000,
	`ai_fast_track_enabled` tinyint NOT NULL DEFAULT 0,
	`external_assessor_enabled` tinyint NOT NULL DEFAULT 1,
	`max_sequential_stages_by_user` int NOT NULL DEFAULT 2,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_configuration_id` PRIMARY KEY(`id`)
);