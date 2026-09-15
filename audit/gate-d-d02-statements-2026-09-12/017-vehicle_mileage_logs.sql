CREATE TABLE `vehicle_mileage_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`tenant_id` varchar(64),
	`mileage` int NOT NULL,
	`recorded_date` timestamp NOT NULL,
	`recorded_by` int NOT NULL,
	`record_type` enum('manual','service','inspection','claim','automated') DEFAULT 'manual',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicle_mileage_logs_id` PRIMARY KEY(`id`)
);