CREATE TABLE `driver_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`driver_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`role` enum('driver','claimant','passenger','third_party_driver','witness','unknown') NOT NULL DEFAULT 'driver',
	`is_at_fault` tinyint NOT NULL DEFAULT 0,
	`was_injured` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `driver_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_dc_unique` UNIQUE(`driver_id`,`claim_id`,`role`)
);