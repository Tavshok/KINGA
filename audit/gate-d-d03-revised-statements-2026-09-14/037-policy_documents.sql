CREATE TABLE `policy_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`policy_id` int NOT NULL,
	`document_type` enum('policy_schedule','certificate_of_insurance','endorsement','cancellation_notice','renewal_notice','other') NOT NULL,
	`document_url` varchar(500) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`file_name` varchar(255),
	`file_size` int,
	`mime_type` varchar(100),
	`uploaded_by` int,
	`tenant_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `policy_documents_id` PRIMARY KEY(`id`)
);