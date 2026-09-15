CREATE TABLE `ingestion_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`batch_name` varchar(255),
	`ingestion_source` enum('processor_upload','bulk_batch','api','email','legacy_import','broker_upload') NOT NULL,
	`ingestion_channel` enum('web_ui','api','email','sftp') NOT NULL,
	`uploaded_by_user_id` int,
	`uploaded_by_email` varchar(320),
	`uploaded_by_ip_address` varchar(45),
	`total_documents` int NOT NULL DEFAULT 0,
	`processed_documents` int NOT NULL DEFAULT 0,
	`failed_documents` int NOT NULL DEFAULT 0,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`started_at` timestamp,
	`completed_at` timestamp,
	`custody_chain` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ingestion_batches_id` PRIMARY KEY(`id`)
);