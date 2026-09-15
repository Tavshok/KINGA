CREATE TABLE `agency_assisted_claimant_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`agency_client_id` int NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`restricted_claimant_user_id` int NOT NULL,
	`verified_claimant_user_id` int,
	`status` enum('restricted','linked_to_verified_claimant') NOT NULL DEFAULT 'restricted',
	`created_by` int NOT NULL,
	`linked_by` int,
	`linked_at` timestamp,
	`link_confirmation_statement` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_assisted_claimant_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_assisted_claimant_identity` UNIQUE(`agency_tenant_id`,`agency_client_id`,`insurer_tenant_id`)
);