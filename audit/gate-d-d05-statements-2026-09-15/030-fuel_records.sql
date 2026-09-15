CREATE TABLE `fuel_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_account_id` int NOT NULL,
	`vehicle_registration` varchar(50) NOT NULL,
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`fuel_date` timestamp NOT NULL,
	`litres` decimal(8,2) NOT NULL,
	`cost_per_litre` decimal(8,4),
	`total_cost_cents` int NOT NULL,
	`odometer` int,
	`fuel_type` enum('petrol','diesel','electric','hybrid','lpg') NOT NULL DEFAULT 'petrol',
	`filled_by` varchar(255),
	`station_name` varchar(255),
	`notes` text,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fuel_records_id` PRIMARY KEY(`id`)
);