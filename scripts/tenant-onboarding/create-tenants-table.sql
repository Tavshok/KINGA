-- Create tenants table for multi-tenant support
CREATE TABLE IF NOT EXISTS `tenants` (
  `id` VARCHAR(255) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL UNIQUE,
  `display_name` VARCHAR(255) NOT NULL,
  `tier` ENUM('tier-basic', 'tier-professional', 'tier-enterprise') NOT NULL DEFAULT 'tier-basic',
  `status` ENUM('active', 'suspended', 'cancelled') NOT NULL DEFAULT 'active',
  `encryption_key_id` VARCHAR(255),
  `contact_name` VARCHAR(255),
  `contact_email` VARCHAR(255) NOT NULL,
  `contact_phone` VARCHAR(50),
  `billing_email` VARCHAR(255) NOT NULL,
  `config_json` JSON,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `activated_at` TIMESTAMP,
  `suspended_at` TIMESTAMP,
  INDEX `idx_tenants_name` (`name`),
  INDEX `idx_tenants_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add tenant_id column to users table if it doesn't exist
ALTER TABLE `users` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_users_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;
