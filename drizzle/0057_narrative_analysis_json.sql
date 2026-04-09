-- Migration: Add narrative_analysis_json column to ai_assessments
-- Purpose: Persist Stage 7e (Incident Narrative Reasoning Engine) output so the
--          ForensicAuditReport renders correctly for historical assessments
--          without requiring a live pipeline re-run.
ALTER TABLE `ai_assessments` ADD COLUMN `narrative_analysis_json` TEXT;
