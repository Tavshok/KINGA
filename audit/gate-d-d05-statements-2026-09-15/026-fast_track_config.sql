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