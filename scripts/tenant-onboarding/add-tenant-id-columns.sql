-- Add tenant_id columns to all relevant tables for multi-tenant isolation
-- This migration adds tenant_id foreign keys and indexes to enable data isolation

-- Claims table
ALTER TABLE `claims` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_claims_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_claims_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Panel Beaters table
ALTER TABLE `panel_beaters` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_panel_beaters_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_panel_beaters_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- AI Assessments table
ALTER TABLE `ai_assessments` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_ai_assessments_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_ai_assessments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Assessor Evaluations table
ALTER TABLE `assessor_evaluations` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_assessor_evaluations_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_assessor_evaluations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Panel Beater Quotes table
ALTER TABLE `panel_beater_quotes` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_panel_beater_quotes_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_panel_beater_quotes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Appointments table
ALTER TABLE `appointments` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_appointments_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_appointments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Audit Trail table
ALTER TABLE `audit_trail` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_audit_trail_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_audit_trail_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Claim Documents table
ALTER TABLE `claim_documents` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_claim_documents_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_claim_documents_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Notifications table
ALTER TABLE `notifications` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_notifications_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_notifications_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Fraud Indicators table
ALTER TABLE `fraud_indicators` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_fraud_indicators_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_fraud_indicators_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Organizations table
ALTER TABLE `organizations` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_organizations_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_organizations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Claim Comments table
ALTER TABLE `claim_comments` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_claim_comments_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_claim_comments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Quote Line Items table
ALTER TABLE `quote_line_items` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_quote_line_items_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_quote_line_items_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;

-- Approval Workflow table
ALTER TABLE `approval_workflow` 
  ADD COLUMN IF NOT EXISTS `tenant_id` VARCHAR(255),
  ADD INDEX IF NOT EXISTS `idx_approval_workflow_tenant_id` (`tenant_id`),
  ADD CONSTRAINT `fk_approval_workflow_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE;
