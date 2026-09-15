CREATE TABLE `pdf_reports` (
	`id` varchar(255) NOT NULL,
	`snapshot_id` varchar(255) NOT NULL,
	`s3_url` text NOT NULL,
	`file_size_bytes` int NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` timestamp,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `pdf_reports_id` PRIMARY KEY(`id`)
);