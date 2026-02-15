CREATE TABLE `supplier_performance_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_name` varchar(255) NOT NULL,
	`supplier_country` varchar(100),
	`total_quotes_submitted` int DEFAULT 0,
	`total_quotes_approved` int DEFAULT 0,
	`total_quotes_rejected` int DEFAULT 0,
	`avg_price_vs_market` decimal(5,2),
	`avg_extraction_confidence` decimal(5,2),
	`first_quote_date` date,
	`last_quote_date` date,
	`last_updated` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_performance_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_performance_metrics_supplier_name_unique` UNIQUE(`supplier_name`)
);
--> statement-breakpoint
CREATE TABLE `supplier_quote_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quote_id` int NOT NULL,
	`part_name` varchar(255) NOT NULL,
	`part_number` varchar(100),
	`part_description` text,
	`part_category` varchar(100),
	`vehicle_make` varchar(100),
	`vehicle_model` varchar(100),
	`vehicle_year_from` int,
	`vehicle_year_to` int,
	`price` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`part_type` enum('OEM','OEM_Equivalent','Aftermarket','Used','Unknown') DEFAULT 'Unknown',
	`quantity` int DEFAULT 1,
	`approved` boolean DEFAULT false,
	`rejection_reason` text,
	`extracted_at` timestamp NOT NULL DEFAULT (now()),
	`line_number` int,
	CONSTRAINT `supplier_quote_line_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_name` varchar(255) NOT NULL,
	`supplier_country` varchar(100) NOT NULL,
	`supplier_contact` varchar(255),
	`quote_date` date NOT NULL,
	`quote_number` varchar(100),
	`quote_valid_until` date,
	`document_url` text NOT NULL,
	`document_type` enum('pdf','excel','image') NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`extracted_at` timestamp,
	`reviewed_at` timestamp,
	`reviewed_by` int,
	`extraction_confidence` decimal(5,2),
	`extraction_notes` text,
	`uploaded_by` int NOT NULL,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	`notes` text,
	CONSTRAINT `supplier_quotes_id` PRIMARY KEY(`id`)
);
