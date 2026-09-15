CREATE TABLE `personal_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`registration` varchar(50),
	`make` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`year` int NOT NULL,
	`vin` varchar(50),
	`colour` varchar(50),
	`engine_size` varchar(20),
	`fuel_type_pv` enum('petrol','diesel','electric','hybrid','other') DEFAULT 'petrol',
	`notes` text,
	`is_primary` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personal_vehicles_id` PRIMARY KEY(`id`)
);