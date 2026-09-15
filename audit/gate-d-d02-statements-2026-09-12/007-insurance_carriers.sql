CREATE TABLE `insurance_carriers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`short_code` varchar(50) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`default_commission_rate` decimal(5,2) NOT NULL,
	`api_endpoint` varchar(500),
	`api_credentials` text,
	`api_enabled` tinyint DEFAULT 0,
	`contact_email` varchar(320),
	`contact_phone` varchar(20),
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurance_carriers_id` PRIMARY KEY(`id`)
);