CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255),
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`type` enum('claim_assigned','quote_submitted','fraud_detected','status_changed','assessment_completed','approval_required','document_uploaded','system_alert') NOT NULL,
	`claim_id` int,
	`entity_type` varchar(50),
	`entity_id` int,
	`module` varchar(64),
	`is_read` tinyint NOT NULL DEFAULT 0,
	`read_at` timestamp,
	`archived_at` timestamp,
	`action_url` varchar(500),
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);