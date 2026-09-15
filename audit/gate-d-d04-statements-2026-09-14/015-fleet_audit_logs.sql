CREATE TABLE `fleet_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64),
	`entity_type` enum('fleet','vehicle','maintenance','service_request','quote','document') NOT NULL,
	`entity_id` int NOT NULL,
	`action` enum('create','update','delete','view','export') NOT NULL,
	`user_id` int NOT NULL,
	`user_name` varchar(255),
	`changes_before` text,
	`changes_after` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_audit_logs_id` PRIMARY KEY(`id`)
);