CREATE TABLE IF NOT EXISTS `agency_product_commission_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `agency_tenant_id` varchar(64) NOT NULL,
  `product_id` int NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `is_active` tinyint NOT NULL DEFAULT 1,
  `configured_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agency_product_commission` (`agency_tenant_id`,`product_id`),
  KEY `idx_agency_product_commission_tenant` (`agency_tenant_id`)
);
