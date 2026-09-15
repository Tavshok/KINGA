CREATE TABLE `vehicle_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`manufacturer` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`variant` varchar(100),
	`generation` varchar(50),
	`year_from` int NOT NULL,
	`year_to` int,
	`body_type` varchar(50),
	`market_region` varchar(100),
	`completeness_score` decimal(4,3) DEFAULT '0.000',
	`profile_cache_json` json,
	`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_models_id` PRIMARY KEY(`id`)
);