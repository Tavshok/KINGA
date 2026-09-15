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
	CONSTRAINT `supplier_performance_metrics_id` PRIMARY KEY(`id`)
);