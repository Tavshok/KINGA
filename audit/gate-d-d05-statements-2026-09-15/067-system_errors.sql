CREATE TABLE `system_errors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`procedure_name` varchar(255),
	`user_id` int,
	`tenant_id` varchar(64),
	`error_message` text,
	`stack_trace` text,
	`error_code` varchar(64),
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `system_errors_id` PRIMARY KEY(`id`)
);