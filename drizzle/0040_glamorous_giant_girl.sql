ALTER TABLE `claims` MODIFY COLUMN `workflow_state` enum('created','intake_queue','intake_verified','assigned','under_assessment','internal_review','technical_approval','financial_decision','payment_authorized','closed','disputed');--> statement-breakpoint
ALTER TABLE `claims` ADD `assigned_processor_id` int;--> statement-breakpoint
ALTER TABLE `claims` ADD `priority` enum('low','medium','high') DEFAULT 'medium';--> statement-breakpoint
ALTER TABLE `claims` ADD `early_fraud_suspicion` tinyint DEFAULT 0 NOT NULL;