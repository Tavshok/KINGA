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