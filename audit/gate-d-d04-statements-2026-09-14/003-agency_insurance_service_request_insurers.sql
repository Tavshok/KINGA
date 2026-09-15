CREATE TABLE `agency_insurance_service_request_insurers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`insurer_tenant_id` varchar(64) NOT NULL,
	`status` enum('invited','viewed','responded','withdrawn') NOT NULL DEFAULT 'invited',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_insurance_service_request_insurers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_service_request_insurer` UNIQUE(`service_request_id`,`insurer_tenant_id`)
);