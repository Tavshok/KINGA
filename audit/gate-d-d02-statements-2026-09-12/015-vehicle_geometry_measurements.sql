CREATE TABLE `vehicle_geometry_measurements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_model_id` int NOT NULL,
	`measurement_type` varchar(80) NOT NULL,
	`value_mm` decimal(10,2) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'mm',
	`confidence` decimal(4,3) NOT NULL DEFAULT '0.900',
	`source_type` varchar(80),
	`source_reference` varchar(255),
	`verified_by` varchar(100),
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_geometry_measurements_id` PRIMARY KEY(`id`)
);