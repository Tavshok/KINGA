CREATE TABLE `ai_assessments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`estimated_cost` int,
	`damage_description` text,
	`detected_damage_types` text,
	`confidence_score` int,
	`fraud_indicators` text,
	`fraud_risk_level` enum('low','medium','high'),
	`model_version` varchar(50),
	`processing_time` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_assessments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `assessor_evaluations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`assessor_id` int NOT NULL,
	`estimated_cost` int,
	`damage_description` text,
	`repair_recommendations` text,
	`additional_notes` text,
	`inspection_date` timestamp,
	`inspection_photos` text,
	`status` enum('pending','in_progress','completed') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_evaluations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entity_type` varchar(50),
	`entity_id` int,
	`previous_value` text,
	`new_value` text,
	`change_description` text,
	`ip_address` varchar(45),
	`user_agent` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claimant_id` int NOT NULL,
	`claim_number` varchar(50) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_registration` varchar(50),
	`incident_date` timestamp,
	`incident_description` text,
	`incident_location` text,
	`damage_photos` text,
	`policy_number` varchar(100),
	`policy_verified` tinyint DEFAULT 0,
	`status` enum('submitted','triage','assessment_pending','assessment_in_progress','quotes_pending','comparison','repair_assigned','repair_in_progress','completed','rejected') NOT NULL DEFAULT 'submitted',
	`assigned_assessor_id` int,
	`assigned_panel_beater_id` int,
	`selected_panel_beater_ids` text,
	`ai_assessment_triggered` tinyint DEFAULT 0,
	`ai_assessment_completed` tinyint DEFAULT 0,
	`fraud_risk_score` int,
	`fraud_flags` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `claims_claim_number_unique` UNIQUE(`claim_number`)
);
--> statement-breakpoint
CREATE TABLE `panel_beater_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`panel_beater_id` int NOT NULL,
	`quoted_amount` int NOT NULL,
	`labor_cost` int,
	`parts_cost` int,
	`estimated_duration` int,
	`itemized_breakdown` text,
	`notes` text,
	`modified` tinyint DEFAULT 0,
	`original_quoted_amount` int,
	`modification_reason` text,
	`modified_by_assessor_id` int,
	`panel_beater_agreed` tinyint,
	`status` enum('draft','submitted','modified','accepted','rejected') NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `panel_beater_quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `panel_beaters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` text NOT NULL,
	`business_name` text NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`address` text,
	`city` varchar(100),
	`approved` tinyint NOT NULL DEFAULT 1,
	`user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `panel_beaters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','insurer','assessor','panel_beater','claimant') NOT NULL DEFAULT 'user';