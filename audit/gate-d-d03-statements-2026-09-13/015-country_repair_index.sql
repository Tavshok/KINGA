CREATE TABLE `country_repair_index` (
	`id` int AUTO_INCREMENT NOT NULL,
	`country_code` varchar(10) NOT NULL,
	`country_name` varchar(100) NOT NULL,
	`vat_rate` decimal(5,4) NOT NULL,
	`import_duty_rate` decimal(5,4) NOT NULL,
	`avg_labour_rate_per_hour` int NOT NULL,
	`currency_code` varchar(10) NOT NULL,
	`effective_from` varchar(10) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `country_repair_index_id` PRIMARY KEY(`id`)
);