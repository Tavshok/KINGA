CREATE TABLE `measurement_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(80) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`unit` varchar(20) NOT NULL DEFAULT 'mm',
	`tier` int NOT NULL DEFAULT 2,
	`base_reliability` decimal(4,3) NOT NULL DEFAULT '0.750',
	`description` text,
	CONSTRAINT `measurement_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `measurement_types_code_unique` UNIQUE(`code`)
);