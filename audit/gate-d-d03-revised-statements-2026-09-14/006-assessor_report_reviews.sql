CREATE TABLE `assessor_report_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`reviewer_user_id` int NOT NULL,
	`reviewer_role` enum('claims_assessor','claims_manager') NOT NULL,
	`status` enum('pending','accepted','returned','rejected','escalated') NOT NULL DEFAULT 'pending',
	`route_reason` enum('assigned_claims_assessor','claims_manager_fallback','claims_manager_escalation') NOT NULL,
	`decision_reason` text,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `assessor_report_reviews_id` PRIMARY KEY(`id`)
);