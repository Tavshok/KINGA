-- Batch 2c/2d (Theme 2 — Silent-Drop Persistence Gaps)
-- Adds four columns to ai_assessments that were previously computed by the pipeline
-- but never written to the database.
--
-- Applied to live DB via webdev_execute_sql on 2026-07-06.
-- This file captures the change for staging/production environments.
--
-- All columns are nullable (existing rows will have NULL, which is correct —
-- they were processed before these fields were added).

ALTER TABLE ai_assessments
  ADD COLUMN IF NOT EXISTS decision_readiness_json LONGTEXT NULL COMMENT 'Stage 10 decisionReadiness object — decision_ready, confidence, blocking_issues, checks, summary',
  ADD COLUMN IF NOT EXISTS degradation_reasons_json TEXT NULL COMMENT 'Stage 10 degradationReasons — string[] of reasons why pipeline ran in degraded mode',
  ADD COLUMN IF NOT EXISTS field_validation_json LONGTEXT NULL COMMENT 'Stage 4 fieldValidation — per-field extraction quality scores and gate results',
  ADD COLUMN IF NOT EXISTS gate_decision_json LONGTEXT NULL COMMENT 'Stage 4 gateDecision — PROCEED/HOLD/REJECT decision with reason and confidence';
