ALTER TABLE `ai_assessments` ADD `is_reanalysis` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `triggered_by` int;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `triggered_role` varchar(50);--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `previous_assessment_id` int;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `reanalysis_reason` text;--> statement-breakpoint
ALTER TABLE `ai_assessments` ADD `version_number` int DEFAULT 1 NOT NULL;