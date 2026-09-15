CREATE TABLE `role_assignment_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`previous_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer'),
	`new_role` enum('user','admin','insurer','assessor','panel_beater','claimant','fleet_admin','fleet_manager','fleet_driver','platform_super_admin','agency','engineer') NOT NULL,
	`previous_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`new_insurer_role` enum('claims_processor','assessor_internal','assessor_external','risk_manager','claims_manager','executive','insurer_admin','recovery_officer'),
	`changed_by_user_id` int NOT NULL,
	`justification` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `role_assignment_audit_id` PRIMARY KEY(`id`)
);