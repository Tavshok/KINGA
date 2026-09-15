CREATE TABLE `governance_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` varchar(50) NOT NULL,
	`tenant_id` varchar(50) NOT NULL,
	`action` varchar(50) NOT NULL,
	`performed_by` varchar(50) NOT NULL,
	`performed_by_name` varchar(200),
	`timestamp_ms` bigint NOT NULL,
	`reason` text NOT NULL,
	`override_flag` tinyint NOT NULL DEFAULT 0,
	`ai_decision` varchar(100),
	`human_decision` varchar(100),
	`action_allowed` tinyint NOT NULL DEFAULT 1,
	`validation_errors_json` text,
	`metadata_json` text,
	CONSTRAINT `governance_audit_log_id` PRIMARY KEY(`id`)
);