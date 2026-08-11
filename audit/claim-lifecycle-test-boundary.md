# Claim Lifecycle Regression Boundary

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026

## Deterministic Coverage Added

`server/claim-lifecycle-contract.test.ts` protects the internal production contract from uploaded claim intake through the KINGA pipeline and report availability. It verifies that:

1. Multipart document intake creates a processor-visible `intake_pending` claim and invokes `triggerAiAssessment`.
2. The assessment entry point records the pipeline run and stage lifecycle through `pipeline_runs` and `pipeline_jobs`, without letting telemetry failure interrupt an assessment.
3. The Claims, Intelligence, and Forensic report generation surfaces remain registered in the reporting path.

## Deliberate Boundary

The regression suite does **not** submit a synthetic production claim, invoke external OCR/LLM providers, or create a live policy/payment record. Such a test must run in an isolated tenant with controlled storage and provider budgets. It is therefore retained as a live OAT requirement rather than presented as a completed automated end-to-end test.
