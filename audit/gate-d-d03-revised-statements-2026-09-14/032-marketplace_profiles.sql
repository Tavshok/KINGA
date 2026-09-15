CREATE TABLE `marketplace_profiles` (
	`id` varchar(36) NOT NULL,
	`type` enum('assessor','panel_beater') NOT NULL,
	`company_name` varchar(255) NOT NULL,
	`country_id` varchar(10) NOT NULL DEFAULT 'ZA',
	`contact_email` varchar(320),
	`contact_phone` varchar(50),
	`address` text,
	`license_number` varchar(100),
	`specializations` json,
	`approval_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`rejection_reason` text,
	`approved_by` int,
	`approved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_profiles_id` PRIMARY KEY(`id`)
);