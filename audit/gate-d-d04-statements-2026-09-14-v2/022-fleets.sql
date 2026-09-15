CREATE TABLE `fleets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_id` int NOT NULL,
	`tenant_id` varchar(64),
	`fleet_name` varchar(255) NOT NULL,
	`fleet_type` enum('mining','logistics','corporate','rental','public_transport','agriculture','construction') NOT NULL,
	`total_vehicles` int DEFAULT 0,
	`active_vehicles` int DEFAULT 0,
	`description` text,
	`primary_location` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`preferred_insurer_id` int,
	`preferred_insurer_name` varchar(255),
	`preferred_insurer_contact` varchar(255),
	`insurer_is_on_kinga` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `fleets_id` PRIMARY KEY(`id`)
);