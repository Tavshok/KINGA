CREATE TABLE `fleet_drivers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`driver_license_number` varchar(50) NOT NULL,
	`license_expiry` date NOT NULL,
	`license_class` varchar(20),
	`hire_date` date NOT NULL,
	`employment_status` enum('active','suspended','terminated') NOT NULL DEFAULT 'active',
	`termination_date` date,
	`emergency_contact_name` varchar(255),
	`emergency_contact_phone` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_drivers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fleet_incident_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`driver_id` int NOT NULL,
	`fleet_id` int NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`incident_date` timestamp NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`severity` enum('minor','moderate','major','critical') NOT NULL DEFAULT 'minor',
	`status` enum('submitted','under_review','approved','rejected','claim_filed') NOT NULL DEFAULT 'submitted',
	`police_report_number` varchar(100),
	`witness_name` varchar(255),
	`witness_phone` varchar(50),
	`estimated_damage` decimal(10,2),
	`vehicle_driveable` tinyint DEFAULT 1,
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`review_notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fleet_incident_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_tenant_id` ON `fleet_drivers` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_fleet_id` ON `fleet_drivers` (`fleet_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_drivers_user_id` ON `fleet_drivers` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_tenant_id` ON `fleet_incident_reports` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_fleet_id` ON `fleet_incident_reports` (`fleet_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_vehicle_id` ON `fleet_incident_reports` (`vehicle_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_driver_id` ON `fleet_incident_reports` (`driver_id`);--> statement-breakpoint
CREATE INDEX `idx_fleet_incident_reports_status` ON `fleet_incident_reports` (`status`);