CREATE TABLE `part_stratification` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used') NOT NULL,
	`price_multiplier` decimal(5,2) NOT NULL,
	`quality_rating` int,
	`warranty_months` int,
	`description` text,
	`part_category` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `part_stratification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`change_type` enum('baseline_update','multiplier_update','override_created','override_deleted','scraper_run') NOT NULL,
	`table_name` varchar(100) NOT NULL,
	`record_id` int,
	`old_value` text,
	`new_value` text,
	`changed_by` int,
	`changed_at` timestamp NOT NULL DEFAULT (now()),
	`reason` text,
	`ip_address` varchar(45),
	CONSTRAINT `parts_pricing_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_baseline` (
	`id` int AUTO_INCREMENT NOT NULL,
	`part_name` varchar(255) NOT NULL,
	`part_number` varchar(100),
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year_from` int,
	`vehicle_year_to` int,
	`sa_base_price` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ZAR',
	`source` varchar(100) NOT NULL,
	`source_url` text,
	`scraped_at` timestamp,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`confidence` enum('low','medium','high') DEFAULT 'medium',
	`data_quality` text,
	CONSTRAINT `parts_pricing_baseline_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parts_pricing_overrides` (
	`id` int AUTO_INCREMENT NOT NULL,
	`part_name` varchar(255),
	`part_number` varchar(100),
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`country` varchar(100),
	`stratum_type` enum('OEM','OEM_Equivalent','Aftermarket','Used'),
	`override_price` decimal(10,2),
	`override_multiplier` decimal(5,2),
	`reason` text NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	CONSTRAINT `parts_pricing_overrides_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regional_pricing_multipliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country` varchar(100) NOT NULL,
	`country_code` varchar(3) NOT NULL,
	`transport_cost_multiplier` decimal(5,2) NOT NULL,
	`duty_rate` decimal(5,2) NOT NULL,
	`handling_fee_flat` decimal(10,2) DEFAULT '0.00',
	`margin_multiplier` decimal(5,2) DEFAULT '1.10',
	`currency_code` varchar(3) NOT NULL,
	`exchange_rate_to_usd` decimal(15,6) NOT NULL,
	`exchange_rate_source` varchar(100),
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	`updated_by` int,
	`notes` text,
	CONSTRAINT `regional_pricing_multipliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `regional_pricing_multipliers_country_unique` UNIQUE(`country`)
);
