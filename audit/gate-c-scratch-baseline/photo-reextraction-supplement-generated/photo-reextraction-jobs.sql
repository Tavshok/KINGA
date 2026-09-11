CREATE TABLE `photo_reextraction_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assessment_id` int NOT NULL,
	`claim_id` int NOT NULL,
	`pdf_url` text NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`requested_dpi` int NOT NULL DEFAULT 300,
	`photos_extracted` int,
	`render_dpi` int,
	`avg_sharpness` int,
	`result_json` text,
	`error_message` text,
	`created_at` varchar(50) NOT NULL,
	`started_at` varchar(50),
	`completed_at` varchar(50),
	`duration_ms` int,
	`triggered_by_user_id` int,
	CONSTRAINT `photo_reextraction_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `photo_reextraction_jobs` ADD CONSTRAINT `photo_reextraction_jobs_claim_id_claims_id_fk` FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON DELETE cascade ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX `idx_prerj_assessment_id` ON `photo_reextraction_jobs` (`assessment_id`);
--> statement-breakpoint
CREATE INDEX `idx_prerj_claim_id` ON `photo_reextraction_jobs` (`claim_id`);
--> statement-breakpoint
CREATE INDEX `idx_prerj_status` ON `photo_reextraction_jobs` (`status`);
--> statement-breakpoint
