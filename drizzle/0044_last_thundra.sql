CREATE TABLE `rate_limit_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`action_type` varchar(50) NOT NULL,
	`window_start` timestamp NOT NULL,
	`action_count` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rate_limit_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_user_tenant_action_window` ON `rate_limit_tracking` (`user_id`,`tenant_id`,`action_type`,`window_start`);--> statement-breakpoint
CREATE INDEX `idx_window_start` ON `rate_limit_tracking` (`window_start`);