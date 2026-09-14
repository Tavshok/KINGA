CREATE TABLE `customer_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`document_type` enum('id_document','drivers_license','proof_of_residence','vehicle_registration','other') NOT NULL,
	`document_url` varchar(500) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`verification_status` enum('pending','verified','rejected') NOT NULL DEFAULT 'pending',
	`verified_at` timestamp,
	`verified_by` int,
	`rejection_reason` text,
	`file_name` varchar(255),
	`file_size` int,
	`mime_type` varchar(100),
	`tenant_id` varchar(255),
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_documents_id` PRIMARY KEY(`id`)
);