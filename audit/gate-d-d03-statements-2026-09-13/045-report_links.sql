CREATE TABLE `report_links` (
	`id` varchar(255) NOT NULL,
	`snapshot_id` varchar(255) NOT NULL,
	`interactive_url` text NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`qr_code_data` text,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_links_id` PRIMARY KEY(`id`)
);