-- ============================================================================
-- TENANT CONFIGURATION TABLES MIGRATION
-- ============================================================================
-- Created: 2026-02-15
-- Purpose: Add 9 tenant configuration tables for multi-tenant insurer platform
-- Note: TEXT field defaults handled in application code (TiDB limitation)

-- 1. Insurer Tenants - Insurance companies leasing the platform
CREATE TABLE IF NOT EXISTS `insurer_tenants` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `display_name` VARCHAR(255) NOT NULL,
  `logo_url` TEXT,
  `primary_color` VARCHAR(7) DEFAULT '#10b981',
  `secondary_color` VARCHAR(7) DEFAULT '#64748b',
  `document_naming_template` TEXT,
  `document_retention_years` INT DEFAULT 7,
  `fraud_retention_years` INT DEFAULT 10,
  `require_manager_approval_above` DECIMAL(10,2) DEFAULT '10000.00',
  `high_value_threshold` DECIMAL(10,2) DEFAULT '10000.00',
  `auto_approve_below` DECIMAL(10,2) DEFAULT '5000.00',
  `fraud_flag_threshold` DECIMAL(3,2) DEFAULT '0.70',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `insurer_tenants_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Tenant Role Configs - Which roles are enabled for each tenant
CREATE TABLE IF NOT EXISTS `tenant_role_configs` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `role_key` ENUM('executive', 'claims_manager', 'claims_processor', 'internal_assessor', 'risk_manager') NOT NULL,
  `enabled` TINYINT NOT NULL DEFAULT 1,
  `display_name` VARCHAR(100),
  `permissions` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tenant_role_configs_id` PRIMARY KEY(`id`),
  CONSTRAINT `tenant_role_configs_tenant_id_role_key_unique` UNIQUE(`tenant_id`, `role_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tenant Workflow Configs - Approval thresholds and routing rules per tenant
CREATE TABLE IF NOT EXISTS `tenant_workflow_configs` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL UNIQUE,
  `require_executive_approval_above` DECIMAL(10,2) DEFAULT '50000.00',
  `require_manager_approval_above` DECIMAL(10,2) DEFAULT '10000.00',
  `auto_approve_below` DECIMAL(10,2) DEFAULT '5000.00',
  `fraud_flag_threshold` DECIMAL(3,2) DEFAULT '0.70',
  `require_internal_assessment` TINYINT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `tenant_workflow_configs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Document Naming Templates - Tenant-customizable document naming conventions
CREATE TABLE IF NOT EXISTS `document_naming_templates` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `doc_type` ENUM('claim', 'assessment', 'report', 'approval') NOT NULL,
  `template` VARCHAR(500) NOT NULL,
  `description` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `document_naming_templates_id` PRIMARY KEY(`id`),
  CONSTRAINT `document_naming_templates_tenant_id_doc_type_unique` UNIQUE(`tenant_id`, `doc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Document Versions - Immutable version history for all generated documents
CREATE TABLE IF NOT EXISTS `document_versions` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `claim_id` INT NOT NULL,
  `document_name` VARCHAR(500) NOT NULL,
  `document_url` TEXT NOT NULL,
  `doc_type` ENUM('claim', 'assessment', 'report', 'approval') NOT NULL,
  `version` INT NOT NULL,
  `created_by` INT NOT NULL,
  `approved_by` INT,
  `approved_at` TIMESTAMP,
  `retention_until` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `document_versions_id` PRIMARY KEY(`id`),
  CONSTRAINT `document_versions_claim_id_doc_type_version_unique` UNIQUE(`claim_id`, `doc_type`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. ISO Audit Logs - Immutable audit trail for all user actions (ISO 9001:2015 compliance)
CREATE TABLE IF NOT EXISTS `iso_audit_logs` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `user_id` INT NOT NULL,
  `user_role` VARCHAR(50) NOT NULL,
  `action_type` ENUM('create', 'update', 'approve', 'reject', 'view', 'delete') NOT NULL,
  `resource_type` VARCHAR(50) NOT NULL,
  `resource_id` VARCHAR(64) NOT NULL,
  `before_state` TEXT,
  `after_state` TEXT,
  `ip_address` VARCHAR(45),
  `session_id` VARCHAR(64),
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `integrity_hash` VARCHAR(64) NOT NULL,
  CONSTRAINT `iso_audit_logs_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Quality Metrics - Process performance metrics for ISO compliance reporting
CREATE TABLE IF NOT EXISTS `quality_metrics` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `metric_type` ENUM('processing_time', 'approval_rate', 'fraud_detection', 'cost_savings') NOT NULL,
  `metric_value` DECIMAL(10,2) NOT NULL,
  `period_start` TIMESTAMP NOT NULL,
  `period_end` TIMESTAMP NOT NULL,
  `calculated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `quality_metrics_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Risk Register - ISO 31000 risk management tracking per claim
CREATE TABLE IF NOT EXISTS `risk_register` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `claim_id` INT NOT NULL,
  `risk_type` ENUM('fraud', 'cost_overrun', 'compliance', 'operational') NOT NULL,
  `likelihood` INT NOT NULL,
  `impact` INT NOT NULL,
  `risk_score` INT NOT NULL,
  `description` TEXT NOT NULL,
  `treatment_plan` ENUM('accept', 'mitigate', 'transfer', 'avoid'),
  `treatment_notes` TEXT,
  `identified_by` INT NOT NULL,
  `identified_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` INT,
  `reviewed_at` TIMESTAMP,
  `status` ENUM('open', 'mitigated', 'closed') NOT NULL DEFAULT 'open',
  CONSTRAINT `risk_register_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Training Records - User competency and training tracking
CREATE TABLE IF NOT EXISTS `training_records` (
  `id` VARCHAR(64) NOT NULL,
  `tenant_id` VARCHAR(64) NOT NULL,
  `user_id` INT NOT NULL,
  `training_type` ENUM('fraud_detection', 'iso_compliance', 'role_onboarding') NOT NULL,
  `completion_date` TIMESTAMP NOT NULL,
  `expiry_date` TIMESTAMP,
  `trainer` VARCHAR(255),
  `assessment_score` DECIMAL(5,2),
  `certificate_url` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `training_records_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS `idx_tenant_role_configs_tenant_id` ON `tenant_role_configs`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_document_versions_claim_id` ON `document_versions`(`claim_id`);
CREATE INDEX IF NOT EXISTS `idx_document_versions_tenant_id` ON `document_versions`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_iso_audit_logs_tenant_id` ON `iso_audit_logs`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_iso_audit_logs_user_id` ON `iso_audit_logs`(`user_id`);
CREATE INDEX IF NOT EXISTS `idx_iso_audit_logs_timestamp` ON `iso_audit_logs`(`timestamp`);
CREATE INDEX IF NOT EXISTS `idx_quality_metrics_tenant_id` ON `quality_metrics`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_risk_register_claim_id` ON `risk_register`(`claim_id`);
CREATE INDEX IF NOT EXISTS `idx_risk_register_tenant_id` ON `risk_register`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_training_records_user_id` ON `training_records`(`user_id`);
CREATE INDEX IF NOT EXISTS `idx_training_records_tenant_id` ON `training_records`(`tenant_id`);
