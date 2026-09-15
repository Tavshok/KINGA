CREATE TABLE `assessor_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`marketplace_profile_id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`tier` enum('free','pro') NOT NULL DEFAULT 'free',
	`max_claims_per_month` int NOT NULL DEFAULT 10,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_subscriptions_id` PRIMARY KEY(`id`)
);