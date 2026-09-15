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