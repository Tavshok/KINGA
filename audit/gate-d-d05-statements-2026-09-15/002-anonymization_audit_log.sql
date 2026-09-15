CREATE TABLE `anonymization_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source_record_id` int NOT NULL,
	`anonymous_record_id` varchar(36),
	`status` enum('success','withheld_k_anonymity','withheld_pii_detected','withheld_tenant_opt_out') NOT NULL,
	`quasi_identifier_hash` varchar(64),
	`group_size` int,
	`transformations_applied` json,
	`anonymized_by_user_id` int,
	`anonymized_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `anonymization_audit_log_id` PRIMARY KEY(`id`)
);