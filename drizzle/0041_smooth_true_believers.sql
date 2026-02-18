ALTER TABLE `tenants` ADD `workflow_config` text;--> statement-breakpoint
ALTER TABLE `tenants` ADD `intake_escalation_hours` int DEFAULT 24;