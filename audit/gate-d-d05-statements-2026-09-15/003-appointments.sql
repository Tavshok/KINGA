CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`appointment_type` enum('claimant_inspection','panel_beater_inspection') NOT NULL,
	`claimant_id` int,
	`panel_beater_id` int,
	`scheduled_date` timestamp NOT NULL,
	`location` text,
	`notes` text,
	`status` enum('scheduled','confirmed','completed','cancelled') NOT NULL DEFAULT 'scheduled',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`tenant_id` varchar(255),
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);