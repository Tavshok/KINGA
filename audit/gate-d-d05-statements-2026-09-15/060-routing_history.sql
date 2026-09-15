CREATE TABLE `routing_history` (
	`id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`confidence_score` decimal(5,2) NOT NULL,
	`confidence_components` text,
	`routing_category` enum('HIGH','MEDIUM','LOW') NOT NULL,
	`routing_decision` enum('AI_FAST_TRACK','INTERNAL_REVIEW','EXTERNAL_REQUIRED','MANUAL_OVERRIDE') NOT NULL,
	`threshold_config_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`model_version` varchar(50) NOT NULL DEFAULT 'v1.0',
	`decided_by` enum('AI','USER') NOT NULL,
	`decided_by_user_id` int,
	`justification` text,
	`explainability_metadata` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`routing_version` int NOT NULL DEFAULT 1,
	`threshold_snapshot` text,
	CONSTRAINT `routing_history_id` PRIMARY KEY(`id`)
);