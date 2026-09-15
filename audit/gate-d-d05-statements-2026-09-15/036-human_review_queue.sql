CREATE TABLE `human_review_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`historical_claim_id` int,
	`review_type` varchar(64) NOT NULL,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_review','completed','rejected') NOT NULL DEFAULT 'pending',
	`assigned_to` int,
	`review_notes` text,
	`queued_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `human_review_queue_id` PRIMARY KEY(`id`)
);