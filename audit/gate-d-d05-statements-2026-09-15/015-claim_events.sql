CREATE TABLE `claim_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`event_type` varchar(100) NOT NULL,
	`event_payload` json,
	`user_id` int,
	`user_role` varchar(50),
	`tenant_id` varchar(255),
	`emitted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_events_id` PRIMARY KEY(`id`)
);