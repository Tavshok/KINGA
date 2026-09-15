CREATE TABLE `maintenance_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`schedule_id` int,
	`tenant_id` varchar(64),
	`alert_type` enum('upcoming_maintenance','overdue_maintenance','inspection_due','safety_alert','compliance_alert') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`due_date` timestamp,
	`due_mileage` int,
	`status` enum('pending','acknowledged','resolved','dismissed') DEFAULT 'pending',
	`acknowledged_by` int,
	`acknowledged_at` timestamp,
	`resolved_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maintenance_alerts_id` PRIMARY KEY(`id`)
);