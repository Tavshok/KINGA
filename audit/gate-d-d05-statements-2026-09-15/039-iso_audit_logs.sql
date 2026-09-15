CREATE TABLE `iso_audit_logs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`action_type` enum('create','update','approve','reject','view','delete') NOT NULL,
	`resource_type` varchar(50) NOT NULL,
	`resource_id` varchar(64) NOT NULL,
	`before_state` text,
	`after_state` text,
	`ip_address` varchar(45),
	`session_id` varchar(64),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`integrity_hash` varchar(64) NOT NULL,
	CONSTRAINT `iso_audit_logs_id` PRIMARY KEY(`id`)
);