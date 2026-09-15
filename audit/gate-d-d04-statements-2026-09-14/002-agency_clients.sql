CREATE TABLE `agency_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`id_number` varchar(50),
	`email` varchar(320),
	`phone` varchar(50),
	`address` text,
	`vehicle_registration` varchar(30),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year` int,
	`vehicle_vin` varchar(50),
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_clients_id` PRIMARY KEY(`id`)
);