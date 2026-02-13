ALTER TABLE `fleet_vehicles` ADD `fleet_id` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `engine_capacity` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `vehicle_mass` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `fuel_type` enum('petrol','diesel','electric','hybrid');--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `transmission_type` enum('manual','automatic');--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `usage_type` enum('private','commercial','logistics','mining','agriculture','public_transport');--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `primary_use` text;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `average_monthly_mileage` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `current_insurer` varchar(255);--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `policy_number` varchar(100);--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `policy_start_date` timestamp;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `policy_end_date` timestamp;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `coverage_type` enum('comprehensive','third_party','third_party_fire_theft');--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `purchase_price` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `purchase_date` timestamp;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `replacement_value` int;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `status` enum('active','inactive','sold','written_off','under_repair') DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `last_inspection_date` timestamp;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `next_inspection_due` timestamp;--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `maintenance_compliance_score` int;