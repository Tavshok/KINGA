CREATE TABLE `notification_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`entity_id` varchar(255) NOT NULL,
	`recipient_user_id` int NOT NULL,
	`recipient_email` varchar(255),
	`idempotency_key` varchar(512) NOT NULL,
	`sent` tinyint NOT NULL DEFAULT 1,
	`skip_reason` varchar(255),
	`tenant_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_events_idempotency_key_unique` UNIQUE(`idempotency_key`)
);