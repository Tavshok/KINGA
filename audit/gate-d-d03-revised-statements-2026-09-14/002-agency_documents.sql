CREATE TABLE `agency_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255),
	`quotation_request_id` int,
	`policy_id` int,
	`document_type` enum('id_document','drivers_license','vehicle_registration','proof_of_address','bank_statement','vehicle_photos','previous_policy','claims_history','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` text NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`uploaded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agency_documents_id` PRIMARY KEY(`id`)
);