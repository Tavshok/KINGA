CREATE TABLE `tenant_isolation_violations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`user_tenant_id` varchar(64),
	`target_tenant_id` varchar(64),
	`procedure_name` varchar(255),
	`ip_address` varchar(45),
	`user_agent` text,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_isolation_violations_id` PRIMARY KEY(`id`)
);