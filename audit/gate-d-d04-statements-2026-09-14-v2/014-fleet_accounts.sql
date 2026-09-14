CREATE TABLE `fleet_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_user_id` int NOT NULL,
	`account_name` varchar(255) NOT NULL,
	`account_code` varchar(50),
	`linked_insurer_tenant_id` varchar(64),
	`linked_agency_id` int,
	`status` enum('active','suspended','pending') NOT NULL DEFAULT 'active',
	`subscription_tier` enum('free','starter','professional','enterprise') NOT NULL DEFAULT 'free',
	`vehicle_count` int NOT NULL DEFAULT 0,
	`notes` text,
	`verification_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`verified_by_user_id` int,
	`verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_accounts_id` PRIMARY KEY(`id`)
);