CREATE TABLE `fleet_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fleet_id` int,
	`vehicle_id` int,
	`tenant_id` varchar(64),
	`document_type` enum('registration_book','ownership_certificate','inspection_report','insurance_policy','service_history','photo','valuation_report','other') NOT NULL,
	`document_name` varchar(255) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`s3_url` text NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`verification_status` enum('pending','verified','rejected') DEFAULT 'pending',
	`verified_by` int,
	`verified_at` timestamp,
	`rejection_reason` text,
	`uploaded_by` int NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fleet_documents_id` PRIMARY KEY(`id`)
);