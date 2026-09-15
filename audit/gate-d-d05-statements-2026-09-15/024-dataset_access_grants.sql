CREATE TABLE `dataset_access_grants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenant_id` varchar(255) NOT NULL,
	`data_scope` enum('tenant_private','tenant_feature','global_anonymized') NOT NULL,
	`granted_to_user_id` int,
	`granted_to_role` varchar(50),
	`granted_to_organization` varchar(255),
	`purpose` text NOT NULL,
	`expiry_date` date,
	`max_records` int,
	`granted_by_user_id` int NOT NULL,
	`granted_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	`revoked_by_user_id` int,
	CONSTRAINT `dataset_access_grants_id` PRIMARY KEY(`id`)
);