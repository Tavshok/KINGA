# KINGA Forensic Engine Manual

## 1. Purpose and boundaries

KINGA’s forensic code provides evidence-aware damage/physics interpretation and forensic report presentation. Relevant implementation is distributed across `server/pipeline-v2/`, `server/reporting/forensicDecisionReport.ts`, `server/reporting/forensicReportModel.ts`, and their tests. It is decision support: it must not be documented or implemented as an automatic denial, fraud finding, repair cost, payment decision, or settlement instruction unless a separately authorised workflow proves that transition.

## 2. Forensic data contract

`resolveForensicReportModel()` in `server/reporting/forensicReportModel.ts` provides an explicit forensic report read model. The model is tenant-scoped and is intended to prevent report presentation from independently rebuilding evidence or approval facts. `forensicReportModel.test.ts` is a key regression source, including report-value parity and approval-path coverage.

The model’s approval presentation represents **human report/decision approval**, not payment authorisation. Stages may include a claims-manager approval and/or an executive/GM sign-off depending on which verified event occurred. A renderer must not imply that both always happen sequentially, and must never invent a final payment-authorisation event.

## 3. Evidence vocabulary

| Category | Meaning | Source boundary |
|---|---|---|
| Observed evidence | A submitted/selected image, document or persisted claim datum | Stored record or evidence metadata |
| Derived measurement | A numeric or structured value calculated/extracted from evidence | Pipeline stage; preserve units and input qualification |
| Physical inference | A conclusion produced from a defined model/assumption set | Physics/damage analysis code and its stated assumptions |
| AI interpretation | LLM/classifier output with confidence/provenance | Server-side AI/pipeline code |
| Business conclusion | A recommendation or workflow outcome | Decision/approval and report governance code |

## 4. Damage and physics controls

Stage 6 includes component normalisation, image eligibility, confidence, crash-direction filtering, photo budget/retry handling and explicit exclusions for ineligible physics measurements. Constants such as `DIRECTION_FILTER_EXCLUSION_CONFIDENCE` and `HTTP_CLIENT_ERROR_STATUS` are named in the extracted Stage 6 modules to avoid opaque business/reliability values.

The repository contains comments and code relating to crush depth, deformation energy, structural displacement and vision confidence. Engineers must retrieve the exact function, units, range checks and test inputs from the relevant pipeline module before modifying it. A complete independent scientific validation dataset, calibration protocol, laboratory traceability record and legal admissibility assessment are **[NOT VERIFIED IN CODEBASE]**.

## 5. Limitations and safe use

- Image evidence can be absent, ambiguous, low-quality, non-vehicle, budget-deferred or processing-failed. These are meaningful states, not zero damage.
- Confidence is a property of a particular computation/interpretation; it is not a probability of legal fault or a mandate to approve/reject.
- Human approval labels must match persisted evidence and must remain separate from payment workflows.
- Any field added to the model must have a real renderer/consumer, a source, tenant scope, an evidence meaning, and a regression. Do not add unused sensitive fields “just in case.”

## 6. Tests to retain

Do not remove or weaken `server/reporting/forensicReportModel.test.ts`, Stage 6 behaviour tests, evidence-presentation tests, or cross-tier report consistency tests without architectural review. These controls protect against silently fabricated, stale, cross-tenant or independently-derived report material.
