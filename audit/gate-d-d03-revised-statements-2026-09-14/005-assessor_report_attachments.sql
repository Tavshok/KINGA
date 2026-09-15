CREATE TABLE `assessor_report_attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` int NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`original_file_name` varchar(500) NOT NULL,
	`storage_key` varchar(500) NOT NULL,
	`file_url` text NOT NULL,
	`mime_type` varchar(255),
	`size_bytes` int,
	`file_hash` varchar(128),
	`attachment_role` enum('original_report','supporting_evidence','generated_export') NOT NULL DEFAULT 'supporting_evidence',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assessor_report_attachments_id` PRIMARY KEY(`id`)
);