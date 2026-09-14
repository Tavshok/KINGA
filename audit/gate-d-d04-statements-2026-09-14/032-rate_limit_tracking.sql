CREATE TABLE `rate_limit_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`action_type` varchar(50) NOT NULL,
	`window_start` timestamp NOT NULL,
	`action_count` int NOT NULL DEFAULT 1,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_tracking_id` PRIMARY KEY(`id`)
);