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
	CONSTRAINT `tenant_workflow_configs_id` PRIMARY KEY(`id`)
);