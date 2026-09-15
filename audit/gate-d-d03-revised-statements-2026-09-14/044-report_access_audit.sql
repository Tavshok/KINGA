CREATE TABLE `report_access_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` varchar(255) NOT NULL,
	`report_type` enum('pdf','interactive') NOT NULL,
	`accessed_by` int NOT NULL,
	`access_type` enum('view','download','export','create') NOT NULL,
	`accessed_at` timestamp NOT NULL DEFAULT (now()),
	`ip_address` varchar(45),
	`user_agent` text,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_access_audit_id` PRIMARY KEY(`id`)
);