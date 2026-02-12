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
--> statement-breakpoint
CREATE TABLE `report_access_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`report_id` varchar(255) NOT NULL,
	`report_type` enum('pdf','interactive') NOT NULL,
	`accessed_by` int NOT NULL,
	`access_type` enum('view','download','export','create') NOT NULL,
	`accessed_at` timestamp NOT NULL DEFAULT (now()),
	`ip_address` varchar(45),
	`user_agent` text,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_access_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_links` (
	`id` varchar(255) NOT NULL,
	`snapshot_id` varchar(255) NOT NULL,
	`interactive_url` text NOT NULL,
	`access_token` varchar(255) NOT NULL,
	`qr_code_data` text,
	`expires_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_links_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`id` varchar(255) NOT NULL,
	`claim_id` int NOT NULL,
	`version` int NOT NULL,
	`report_type` enum('insurer','assessor','regulatory') NOT NULL,
	`intelligence_data` json NOT NULL,
	`audit_hash` varchar(64) NOT NULL,
	`generated_by` int NOT NULL,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`is_immutable` boolean NOT NULL DEFAULT true,
	`tenant_id` varchar(255) NOT NULL,
	CONSTRAINT `report_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `pdf_reports` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `pdf_reports` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_report_id` ON `report_access_audit` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_accessed_by` ON `report_access_audit` (`accessed_by`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_access_audit` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_accessed_at` ON `report_access_audit` (`accessed_at`);--> statement-breakpoint
CREATE INDEX `idx_snapshot_id` ON `report_links` (`snapshot_id`);--> statement-breakpoint
CREATE INDEX `idx_access_token` ON `report_links` (`access_token`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_links` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_claim_version` ON `report_snapshots` (`claim_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_audit_hash` ON `report_snapshots` (`audit_hash`);--> statement-breakpoint
CREATE INDEX `idx_tenant_id` ON `report_snapshots` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_generated_by` ON `report_snapshots` (`generated_by`);