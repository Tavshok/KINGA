CREATE TABLE `customer_consent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_id` int NOT NULL,
	`consent_type` enum('data_processing','marketing','third_party_sharing','credit_check','automated_decision_making') NOT NULL,
	`consent_given` tinyint NOT NULL,
	`consent_date` timestamp NOT NULL DEFAULT (now()),
	`withdrawn_date` timestamp,
	`consent_method` varchar(50),
	`consent_version` varchar(20),
	`tenant_id` varchar(255),
	CONSTRAINT `customer_consent_id` PRIMARY KEY(`id`)
);