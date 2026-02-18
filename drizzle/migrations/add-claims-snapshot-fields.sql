-- Migration: Add Claims Domain Model Snapshot Fields
-- Purpose: Normalize claims table with routing, governance, and analytics snapshot fields
-- Date: 2026-02-18
-- Author: System

-- Add snapshot fields to claims table
ALTER TABLE `claims`
ADD COLUMN `estimated_claim_value` DECIMAL(12,2) NULL COMMENT 'Snapshot from AI assessment at routing time',
ADD COLUMN `final_approved_amount` DECIMAL(12,2) NULL COMMENT 'Final approved amount (replaces approvedAmount)',
ADD COLUMN `confidence_score` INT NULL COMMENT 'Snapshot from AI assessment at routing time (0-100)',
ADD COLUMN `routing_decision` VARCHAR(50) NULL COMMENT 'Snapshot: ai_only, hybrid, manual',
ADD COLUMN `policy_version_id` INT NULL COMMENT 'References automation_policies.id at routing time';

-- Add indexes for performance
CREATE INDEX `idx_fraud_risk_score` ON `claims` (`fraud_risk_score`);
CREATE INDEX `idx_confidence_score` ON `claims` (`confidence_score`);
CREATE INDEX `idx_routing_decision` ON `claims` (`routing_decision`);
CREATE INDEX `idx_policy_version_id` ON `claims` (`policy_version_id`);

-- Add foreign key constraint (optional, for referential integrity)
-- ALTER TABLE `claims`
-- ADD CONSTRAINT `fk_claims_policy_version`
-- FOREIGN KEY (`policy_version_id`) REFERENCES `automation_policies`(`id`)
-- ON DELETE SET NULL ON UPDATE CASCADE;
