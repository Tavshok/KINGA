CREATE TABLE `claim_intake_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`idempotency_key` varchar(64) NOT NULL,
	`request_hash` varchar(64) NOT NULL,
	`channel` varchar(50) NOT NULL,
	`claim_id` int,
	`status` varchar(50) NOT NULL DEFAULT 'persisted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_intake_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_claim_intake_request_actor` UNIQUE(`tenant_id`,`user_id`,`idempotency_key`)
);