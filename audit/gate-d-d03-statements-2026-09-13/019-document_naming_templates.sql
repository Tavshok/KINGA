CREATE TABLE `document_naming_templates` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`doc_type` enum('claim','assessment','report','approval') NOT NULL,
	`template` varchar(500) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_naming_templates_id` PRIMARY KEY(`id`)
);