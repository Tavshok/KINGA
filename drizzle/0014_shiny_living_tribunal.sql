ALTER TABLE `fleet_vehicles` ADD `vehicle_origin` enum('Local_Assembly','Ex_Japanese','Ex_European','Ex_American','Ex_Chinese','Unknown') DEFAULT 'Unknown';--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `imported_from` varchar(100);--> statement-breakpoint
ALTER TABLE `fleet_vehicles` ADD `import_year` int;--> statement-breakpoint
ALTER TABLE `supplier_quote_line_items` ADD `shipping_cost` decimal(10,2);--> statement-breakpoint
ALTER TABLE `supplier_quote_line_items` ADD `customs_duty` decimal(10,2);--> statement-breakpoint
ALTER TABLE `supplier_quote_line_items` ADD `clearing_fees` decimal(10,2);--> statement-breakpoint
ALTER TABLE `supplier_quote_line_items` ADD `forex_charges` decimal(10,2);--> statement-breakpoint
ALTER TABLE `supplier_quote_line_items` ADD `lead_time_days` int;