CREATE TABLE `tenant_invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role` enum('user','admin','insurer','assessor','panel_beater','claimant','platform_super_admin','fleet_admin','fleet_manager','fleet_driver') NOT NULL,
	`insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin'),
	`token` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tenant_invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `tenant_id_idx` ON `tenant_invitations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `email_idx` ON `tenant_invitations` (`email`);--> statement-breakpoint
CREATE INDEX `token_idx` ON `tenant_invitations` (`token`);--> statement-breakpoint
CREATE INDEX `expires_at_idx` ON `tenant_invitations` (`expires_at`);