CREATE TABLE `access_denial_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`attempted_route` varchar(500),
	`user_role` varchar(100),
	`insurer_role` varchar(100),
	`tenant_id` varchar(255),
	`denial_reason` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_denial_log_id` PRIMARY KEY(`id`)
);
