CREATE TABLE `insurer_marketplace_relationships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`insurer_tenant_id` varchar(255) NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`relationship_status` enum('approved','suspended','blacklisted') NOT NULL DEFAULT 'approved',
	`sla_signed` tinyint NOT NULL DEFAULT 0,
	`preferred` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_marketplace_relationships_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_insurer_relationship` UNIQUE(`insurer_tenant_id`,`marketplace_profile_id`)
);