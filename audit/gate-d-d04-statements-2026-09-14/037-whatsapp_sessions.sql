CREATE TABLE `whatsapp_sessions` (
	`id` varchar(36) NOT NULL,
	`phone_number` varchar(30) NOT NULL,
	`intent` varchar(50),
	`state` varchar(80) NOT NULL DEFAULT 'IDLE',
	`data` json,
	`photo_urls` json,
	`status` enum('active','paused','submitted','expired') NOT NULL DEFAULT 'active',
	`resume_context` text,
	`last_message_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_sessions_id` PRIMARY KEY(`id`)
);