CREATE TABLE `tenant_role_configs` (
	`tenant_id` varchar(64) NOT NULL,
	`role_key` enum('executive','claims_manager','claims_processor','assessor_internal','assessor_external','risk_manager','insurer_admin','recovery_officer') NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`display_name` varchar(100),
	`permissions` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tenant_role_configs_tenant_id_role_key_pk` PRIMARY KEY(`tenant_id`,`role_key`)
);