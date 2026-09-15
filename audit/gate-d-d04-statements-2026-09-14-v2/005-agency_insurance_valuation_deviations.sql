CREATE TABLE `agency_insurance_valuation_deviations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_request_id` int NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`client_proposed_value_cents` int NOT NULL,
	`kinga_market_valuation_cents` int NOT NULL,
	`variance_percent` decimal(7,2) NOT NULL,
	`acknowledgement_json` json NOT NULL,
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agency_insurance_valuation_deviations_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_insurance_valuation_deviation_request` UNIQUE(`service_request_id`)
);