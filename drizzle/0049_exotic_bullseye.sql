ALTER TABLE `maintenance_schedules` MODIFY COLUMN `is_active` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `automation_policies` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `automation_policies` ADD `effective_from` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `automation_policies` ADD `effective_until` timestamp;--> statement-breakpoint
ALTER TABLE `automation_policies` ADD `superseded_by_policy_id` int;