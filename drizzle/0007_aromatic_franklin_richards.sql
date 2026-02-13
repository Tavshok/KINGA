ALTER TABLE `insurance_quotes` MODIFY COLUMN `status` enum('pending','payment_pending','payment_submitted','payment_verified','accepted','rejected','expired') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_method` enum('cash','bank_transfer','ecocash','onemoney','rtgs','zipit');--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_reference_number` varchar(100);--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_proof_s3_key` varchar(500);--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_proof_s3_url` varchar(500);--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_amount` int;--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_date` timestamp;--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_submitted_at` timestamp;--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_verified_at` timestamp;--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_verified_by` int;--> statement-breakpoint
ALTER TABLE `insurance_quotes` ADD `payment_rejection_reason` text;