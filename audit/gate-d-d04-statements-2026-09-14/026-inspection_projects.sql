CREATE TABLE `inspection_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`project_ref` varchar(50) NOT NULL,
	`project_name` varchar(255) NOT NULL,
	`client_name` varchar(255),
	`description` text,
	`project_status` enum('active','completed','on_hold','cancelled') NOT NULL DEFAULT 'active',
	`start_date` timestamp,
	`target_end_date` timestamp,
	`completed_at` timestamp,
	`total_inspections` int NOT NULL DEFAULT 0,
	`completed_inspections` int NOT NULL DEFAULT 0,
	`lead_engineer_id` int,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_projects_id` PRIMARY KEY(`id`)
);