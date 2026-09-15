CREATE TABLE `generated_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` int NOT NULL,
	`claim_id` int,
	`report_type` enum('claims_assessment','portfolio_summary','fraud_intelligence','executive_summary','risk_portfolio','processor_performance','assessor_performance','panel_beater_performance') NOT NULL,
	`tier` enum('process','protect','prove') NOT NULL DEFAULT 'process',
	`s3_key` varchar(500) NOT NULL,
	`url` varchar(1000) NOT NULL,
	`generated_by_user_id` int NOT NULL,
	`generated_at` varchar(50) NOT NULL,
	`file_size_bytes` int,
	`page_count` int,
	`status` enum('generating','ready','failed') NOT NULL DEFAULT 'ready',
	`error_message` text,
	`created_at` varchar(50) NOT NULL,
	CONSTRAINT `generated_reports_id` PRIMARY KEY(`id`)
);