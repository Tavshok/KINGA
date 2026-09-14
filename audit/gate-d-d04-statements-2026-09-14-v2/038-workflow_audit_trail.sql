CREATE TABLE `workflow_audit_trail` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`user_id` int NOT NULL,
	`user_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer') NOT NULL,
	`previous_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed'),
	`new_state` enum('intake_queue','created','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed') NOT NULL,
	`decision_value` int,
	`ai_score` int,
	`confidence_score` int,
	`comments` text,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`executive_override` int DEFAULT 0,
	`override_reason` text,
	CONSTRAINT `workflow_audit_trail_id` PRIMARY KEY(`id`)
);