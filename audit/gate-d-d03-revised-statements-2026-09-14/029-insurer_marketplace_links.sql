CREATE TABLE `insurer_marketplace_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`linked_by` int,
	`linked_at` timestamp NOT NULL DEFAULT (now()),
	`suspended_at` timestamp,
	`suspension_reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_marketplace_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_insurer_marketplace_link` UNIQUE(`insurer_tenant_id`,`marketplace_profile_id`)
);