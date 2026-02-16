CREATE TABLE `claim_involvement_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`workflow_stage` enum('assessment','technical_approval','financial_decision','payment_authorization') NOT NULL,
	`action_type` enum('transition_state','approve_technical','authorize_payment','close_claim','redirect_claim','add_assessment') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `claim_involvement_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin') NOT NULL,
	`previous_state` enum('created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed'),
	`new_state` enum('created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed') NOT NULL,
	`decision_value` int,
	`ai_score` int,
	`confidence_score` int,
	`comments` text,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workflow_audit_trail_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `workflow_configuration` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`risk_manager_enabled` tinyint NOT NULL DEFAULT 1,
	`high_value_threshold` int NOT NULL DEFAULT 1000000,
	`executive_review_threshold` int NOT NULL DEFAULT 5000000,
	`ai_fast_track_enabled` tinyint NOT NULL DEFAULT 0,
	`external_assessor_enabled` tinyint NOT NULL DEFAULT 1,
	`max_sequential_stages_by_user` int NOT NULL DEFAULT 2,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workflow_configuration_id` PRIMARY KEY(`id`),
	CONSTRAINT `workflow_configuration_tenant_id_unique` UNIQUE(`tenant_id`)
);
--> statement-breakpoint
ALTER TABLE `claims` MODIFY COLUMN `workflow_state` enum('created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed');--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin');