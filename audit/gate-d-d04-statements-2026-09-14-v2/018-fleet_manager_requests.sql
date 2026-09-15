CREATE TABLE `fleet_manager_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`fleet_account_id` int,
	`company_name` varchar(255) NOT NULL,
	`company_reg` varchar(100),
	`job_title` varchar(255),
	`contact_phone` varchar(100),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`review_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_manager_requests_id` PRIMARY KEY(`id`)
);