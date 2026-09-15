CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`module` varchar(64) NOT NULL,
	`in_app_enabled` tinyint NOT NULL DEFAULT 1,
	`email_enabled` tinyint NOT NULL DEFAULT 0,
	`sms_enabled` tinyint NOT NULL DEFAULT 0,
	`min_priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'low',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_notif_pref_user_module` UNIQUE(`user_id`,`tenant_id`,`module`)
);