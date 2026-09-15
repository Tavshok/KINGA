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