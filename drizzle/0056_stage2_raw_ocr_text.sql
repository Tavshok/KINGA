-- Migration: Add stage2_raw_ocr_text column to ai_assessments
-- Purpose: Store the raw OCR text extracted from claim PDFs in Stage 2
--          for audit trails and re-extraction without re-running the full pipeline.
ALTER TABLE `ai_assessments` ADD COLUMN `stage2_raw_ocr_text` TEXT;
