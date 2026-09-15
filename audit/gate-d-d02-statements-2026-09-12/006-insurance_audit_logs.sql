CREATE TABLE `insurance_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`user_id` int NOT NULL,
	`user_role` varchar(50),
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50) NOT NULL,
	`entity_id` int NOT NULL,
	`changes` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`tenant_id` varchar(255),
	CONSTRAINT `insurance_audit_logs_id` PRIMARY KEY(`id`)
);