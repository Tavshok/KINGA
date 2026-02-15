ALTER TABLE `insurer_tenants` ADD `primary_currency` varchar(3) DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE `insurer_tenants` ADD `primary_currency_symbol` varchar(10) DEFAULT '$';--> statement-breakpoint
ALTER TABLE `insurer_tenants` ADD `secondary_currency` varchar(3);--> statement-breakpoint
ALTER TABLE `insurer_tenants` ADD `secondary_currency_symbol` varchar(10);--> statement-breakpoint
ALTER TABLE `insurer_tenants` ADD `exchange_rate` decimal(10,4);