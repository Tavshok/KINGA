ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `fleets` ADD `preferred_insurer_id` int;--> statement-breakpoint
ALTER TABLE `fleets` ADD `preferred_insurer_name` varchar(255);--> statement-breakpoint
ALTER TABLE `fleets` ADD `preferred_insurer_contact` varchar(255);--> statement-breakpoint
ALTER TABLE `fleets` ADD `insurer_is_on_kinga` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `maintenance_records` ADD `related_claim_id` int;--> statement-breakpoint
ALTER TABLE `maintenance_records` ADD `is_claim_related` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `service_requests` ADD `requires_approval` tinyint DEFAULT 1;--> statement-breakpoint
ALTER TABLE `service_requests` ADD `approval_status` enum('pending','approved','rejected') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `service_requests` ADD `approved_by` int;--> statement-breakpoint
ALTER TABLE `service_requests` ADD `approved_at` timestamp;--> statement-breakpoint
ALTER TABLE `service_requests` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `service_requests` ADD `submitted_by` int NOT NULL;