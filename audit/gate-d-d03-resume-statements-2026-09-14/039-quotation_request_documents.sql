CREATE TABLE `quotation_request_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotation_request_id` int NOT NULL,
	`client_user_id` int,
	`document_type_qrd` enum('policy_schedule','certificate_of_insurance','endorsement','renewal_notice','cancellation_notice','cover_note','debit_note','claim_form','proposal_form','other') NOT NULL DEFAULT 'other',
	`title` varchar(255) NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_url` text NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`file_size` int,
	`mime_type` varchar(100),
	`sent_by_agent_id` int,
	`delivered_to_client` tinyint NOT NULL DEFAULT 1,
	`emailed_to_client` tinyint NOT NULL DEFAULT 0,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_request_documents_id` PRIMARY KEY(`id`)
);