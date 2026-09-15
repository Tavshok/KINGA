CREATE TABLE `repair_cost_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_make` varchar(100) NOT NULL,
	`vehicle_model` varchar(100) NOT NULL,
	`vehicle_year` int,
	`damage_category` varchar(100) NOT NULL,
	`country` varchar(10) NOT NULL DEFAULT 'ZA',
	`median_repair_cost` int NOT NULL,
	`min_repair_cost` int NOT NULL,
	`max_repair_cost` int NOT NULL,
	`claim_count` int NOT NULL DEFAULT 0,
	`intelligence_confidence` enum('low','medium','high') NOT NULL DEFAULT 'low',
	`last_updated` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `repair_cost_intelligence_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_rci_unique` UNIQUE(`vehicle_make`,`vehicle_model`,`damage_category`,`country`)
);