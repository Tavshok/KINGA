CREATE TABLE `document_naming_templates` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`doc_type` enum('claim','assessment','report','approval') NOT NULL,
	`template` varchar(500) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_naming_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_naming_templates_tenant_id_doc_type_unique` UNIQUE(`tenant_id`,`doc_type`)
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`document_name` varchar(500) NOT NULL,
	`document_url` text NOT NULL,
	`doc_type` enum('claim','assessment','report','approval') NOT NULL,
	`version` int NOT NULL,
	`created_by` int NOT NULL,
	`approved_by` int,
	`approved_at` timestamp,
	`retention_until` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `document_versions_claim_id_doc_type_version_unique` UNIQUE(`claim_id`,`doc_type`,`version`)
);
--> statement-breakpoint
CREATE TABLE `insurer_tenants` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`logo_url` text,
	`primary_color` varchar(7) DEFAULT '#10b981',
	`secondary_color` varchar(7) DEFAULT '#64748b',
	`document_naming_template` text,
	`document_retention_years` int DEFAULT 7,
	`fraud_retention_years` int DEFAULT 10,
	`require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
	`high_value_threshold` decimal(10,2) DEFAULT '10000.00',
	`auto_approve_below` decimal(10,2) DEFAULT '5000.00',
	`fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `insurer_tenants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `iso_audit_logs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`user_role` varchar(50) NOT NULL,
	`action_type` enum('create','update','approve','reject','view','delete') NOT NULL,
	`resource_type` varchar(50) NOT NULL,
	`resource_id` varchar(64) NOT NULL,
	`before_state` text,
	`after_state` text,
	`ip_address` varchar(45),
	`session_id` varchar(64),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`integrity_hash` varchar(64) NOT NULL,
	CONSTRAINT `iso_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_metrics` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`metric_type` enum('processing_time','approval_rate','fraud_detection','cost_savings') NOT NULL,
	`metric_value` decimal(10,2) NOT NULL,
	`period_start` timestamp NOT NULL,
	`period_end` timestamp NOT NULL,
	`calculated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_register` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`claim_id` int NOT NULL,
	`risk_type` enum('fraud','cost_overrun','compliance','operational') NOT NULL,
	`likelihood` int NOT NULL,
	`impact` int NOT NULL,
	`risk_score` int NOT NULL,
	`description` text NOT NULL,
	`treatment_plan` enum('accept','mitigate','transfer','avoid'),
	`treatment_notes` text,
	`identified_by` int NOT NULL,
	`identified_at` timestamp NOT NULL DEFAULT (now()),
	`reviewed_by` int,
	`reviewed_at` timestamp,
	`status` enum('open','mitigated','closed') NOT NULL DEFAULT 'open',
	CONSTRAINT `risk_register_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tenant_role_configs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`role_key` enum('executive','claims_manager','claims_processor','internal_assessor','risk_manager') NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`display_name` varchar(100),
	`permissions` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_role_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_role_configs_tenant_id_role_key_unique` UNIQUE(`tenant_id`,`role_key`)
);
--> statement-breakpoint
CREATE TABLE `tenant_workflow_configs` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`require_executive_approval_above` decimal(10,2) DEFAULT '50000.00',
	`require_manager_approval_above` decimal(10,2) DEFAULT '10000.00',
	`auto_approve_below` decimal(10,2) DEFAULT '5000.00',
	`fraud_flag_threshold` decimal(3,2) DEFAULT '0.70',
	`require_internal_assessment` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_workflow_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `tenant_workflow_configs_tenant_id_unique` UNIQUE(`tenant_id`)
);
--> statement-breakpoint
CREATE TABLE `training_records` (
	`id` varchar(64) NOT NULL,
	`tenant_id` varchar(64) NOT NULL,
	`user_id` int NOT NULL,
	`training_type` enum('fraud_detection','iso_compliance','role_onboarding') NOT NULL,
	`completion_date` timestamp NOT NULL,
	`expiry_date` timestamp,
	`trainer` varchar(255),
	`assessment_score` decimal(5,2),
	`certificate_url` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_records_id` PRIMARY KEY(`id`)
);
