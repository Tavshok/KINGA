CREATE TABLE `engineer_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`skills` json,
	`certifications` json,
	`region` varchar(100),
	`region_lat` decimal(10,7),
	`region_lng` decimal(10,7),
	`max_travel_radius_km` int DEFAULT 100,
	`is_available` tinyint NOT NULL DEFAULT 1,
	`availability_notes` text,
	`active_inspections` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engineer_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_ep_user_id` UNIQUE(`user_id`)
);