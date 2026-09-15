CREATE TABLE `audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int,
	`user_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50),
	`entity_id` int,
	`previous_value` text,
	`new_value` text,
	`change_description` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_trail_id` PRIMARY KEY(`id`)
);