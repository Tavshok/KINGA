-- ARCH-03b: Add 'moderate' to fraud_risk_level enum in all tables
-- This migration adds 'moderate' as a valid value for the fraud_risk_level column
-- across all tables that store this field. The 'moderate' value corresponds to
-- fraud scores 40-60 per FSS-2026-001 (formerly stored as 'medium').
--
-- Tables affected:
--   ai_assessments      - primary pipeline output
--   assessor_evaluations - assessor manual review
--   claims              - claim-level summary
--   fraud_indicators    - fraud indicator breakdown
--   historical_replay_results - replay/simulation results

ALTER TABLE `ai_assessments`
  MODIFY COLUMN `fraud_risk_level` ENUM('low','medium','moderate','high','critical','elevated');

ALTER TABLE `assessor_evaluations`
  MODIFY COLUMN `fraud_risk_level` ENUM('low','medium','moderate','high');

ALTER TABLE `claims`
  MODIFY COLUMN `fraud_risk_level` ENUM('low','medium','moderate','high');

ALTER TABLE `fraud_indicators`
  MODIFY COLUMN `fraud_risk_level` ENUM('low','medium','moderate','high','critical','elevated') NOT NULL;

ALTER TABLE `historical_replay_results`
  MODIFY COLUMN `fraud_risk_level` ENUM('none','low','medium','moderate','high','critical','elevated');
