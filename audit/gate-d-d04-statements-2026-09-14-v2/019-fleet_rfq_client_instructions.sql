CREATE TABLE `fleet_rfq_client_instructions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`fleet_account_id` int NOT NULL,
	`instruction` enum('accepted','rejected') NOT NULL,
	`status` enum('requested','executed','cancelled') NOT NULL DEFAULT 'requested',
	`instructed_by` int NOT NULL,
	`executed_by` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`executed_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_rfq_client_instructions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fleet_rfq_client_instruction` UNIQUE(`quote_request_id`)
);