ALTER TABLE `assessor_evaluations` ADD `disagrees_with_ai` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `assessor_evaluations` ADD `ai_disagreement_reason` text;