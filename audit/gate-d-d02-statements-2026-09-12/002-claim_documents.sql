CREATE TABLE `claim_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claim_id` int NOT NULL,
	`uploaded_by` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_key` varchar(500) NOT NULL,
	`file_url` text NOT NULL,
	`file_size` int NOT NULL,
	`mime_type` varchar(100) NOT NULL,
	`document_title` varchar(255),
	`document_description` text,
	`document_category` enum('damage_photo','repair_quote','invoice','police_report','medical_report','insurance_policy','correspondence','other') NOT NULL DEFAULT 'other',
	`visible_to_roles` text,
	`inspection_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `claim_documents_id` PRIMARY KEY(`id`)
);