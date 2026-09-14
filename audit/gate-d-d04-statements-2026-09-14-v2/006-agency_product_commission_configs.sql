CREATE TABLE `agency_product_commission_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agency_tenant_id` varchar(64) NOT NULL,
	`product_id` int NOT NULL,
	`commission_rate` decimal(5,2) NOT NULL,
	`is_active` tinyint NOT NULL DEFAULT 1,
	`configured_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agency_product_commission_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_agency_product_commission` UNIQUE(`agency_tenant_id`,`product_id`)
);