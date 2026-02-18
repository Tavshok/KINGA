ALTER TABLE `tenants` MODIFY COLUMN `intake_escalation_hours` int DEFAULT 6;--> statement-breakpoint
ALTER TABLE `tenants` ADD `intake_escalation_enabled` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tenants` ADD `intake_escalation_mode` enum('auto_assign','escalate_only') DEFAULT 'escalate_only';