# 05 — Pipeline Reference

## Entry Point

```
triggerAiAssessment(claimId: number)  →  server/db.ts
  └── runPipelineV2(ctx: PipelineContext)  →  server/pipeline-v2/orchestrator.ts
```

The orchestrator is a single large async function (~2,300 lines). It is structured as a sequential series of named stage blocks with two parallel `Promise.all` blocks (Stage 8 ‖ Stage 9, and the post-S8/S9 block). Each stage block:

1. Calls `ctx.onStageStart("Stage N — Label")` — updates `claims.pipelineCurrentStage` in DB (visible in the UI progress indicator)
2. Executes the stage logic (LLM calls, computation, DB reads)
3. Writes its output to the `ctx` object for downstream stages
4. Optionally calls `ctx.onStageComplete(stageName, durationMs)` for observability

---

## Stage Reference

### Stage 1 — Document Ingestion
**Lines:** ~461–529  
**Input:** `ctx.pdfDownloadUrl` (presigned S3 URL) or `ctx.damagePhotoUrls`  
**Output:** `ctx.pageImageUrls[]` (PNG images of each PDF page, uploaded to S3)  
**Method:** `pdftoppm` system binary (150 DPI). Falls back to `pdfjs-dist` embedded image extraction if `pdftoppm` is unavailable.  
**Key behaviour:** Each PDF page is rendered to a PNG and uploaded to S3 under `{tenantId}/pipeline/{assessmentId}/pages/`. The URLs are stored in `ai_assessments.pageImageUrlsJson` for audit and re-use in subsequent stages.

---

### Stage 2 — OCR & Text Extraction
**Lines:** ~530–627  
**Input:** `ctx.pageImageUrls[]`  
**Output:** `ctx.rawOcrText` (full document text)  
**Method:** LLM vision call on each page image. Falls back to Tesseract OCR if LLM vision fails. Sparse-text fallback for pages with minimal text.  
**Key behaviour:** The raw OCR text is stored in `ai_assessments.stage2RawOcrText` and is never overwritten — it is the immutable evidence record of what was in the document.

---

### Stage 0a — Document Read Verification
**Lines:** ~628–656  
**Input:** `ctx.rawOcrText`  
**Output:** Pipeline gate decision  
**Key behaviour:** Confirms at least one page was successfully read. If `rawOcrText` is empty or below a minimum length threshold, throws `PipelineIncompleteError` with reason `DOCUMENT_UNREADABLE`.

---

### Stage 0 — Evidence Registry Initialisation
**Lines:** ~657–689  
**Input:** Stage 1 and Stage 2 outputs  
**Output:** `ctx.evidenceRegistry` (initial state)  
**Key behaviour:** Builds the initial evidence registry from available sources. The registry tracks what evidence is present (damage photos, quotation scans, police report, etc.) and is updated by subsequent stages.

---

### Stage 3 — Structured Data Extraction
**Lines:** ~690–717 (calls `runExtractionStage()`)  
**Input:** `ctx.rawOcrText`, `ctx.pageImageUrls[]`  
**Output:** `ctx.extractedData` (raw LLM extraction, pre-validation)  
**Method:** LLM call with a structured JSON schema response format. The schema mirrors the `ClaimRecord` type.  
**Key behaviour:** The claimant-stated speed (`claimantStatedSpeed`) is extracted here and stored as `claims.claimantStatedSpeedKmh`. **This field is immutable after this stage** — it represents what the claimant stated, not what the physics engine computed.

---

### Stage 4 — Data Validation
**Lines:** ~718–765  
**Input:** `ctx.extractedData`  
**Output:** `ctx.validatedData` (Zod-validated + coerced), `ctx.stage4Output` (field-level confidence scores, pipeline gate decision)  
**Key behaviour:** Applies Zod schema validation with field-level confidence scoring. Fields that fail validation are marked with `confidence: 0` and a reason. The pipeline gate decision (`PROCEED` / `HUMAN_REVIEW_REQUIRED`) is based on the aggregate confidence score.

---

### Stage 5 — Claim Data Assembly
**Lines:** ~766–797 (calls `runAssemblyStage()`)  
**Input:** `ctx.validatedData`  
**Output:** `ctx.claimRecord` (canonical `ClaimRecord`), vehicle/driver upserts in DB  
**Key behaviour:** Normalises repair quotes (currency conversion, line-item parsing), performs vehicle lookup (VIN/registration against `vehicleRegistry`), classifies incident type, and upserts vehicle and driver records. The `ClaimRecord` is the canonical structured representation used by all downstream stages.

---

### Stage 0.5 — Scenario-Conditional Evidence Notes
**Lines:** ~798–867  
**Input:** `ctx.claimRecord.incidentType`  
**Output:** Evidence registry updated with scenario-specific hints  
**Key behaviour:** Adds scenario-specific evidence requirements to the registry (e.g., for a rear-end collision, notes that a police report and third-party statement are expected).

---

### Stage 2.5 — Automotive Domain Corrector
**Lines:** ~868–1023  
**Input:** `ctx.claimRecord` (vehicle make/model/part names)  
**Output:** `ctx.claimRecord` (corrected)  
**Key behaviour:** Corrects common OCR and LLM errors in automotive terminology (e.g., "Toyata" → "Toyota", "bonnet" vs "hood" normalisation). Uses a curated automotive vocabulary.

---

### Stage 2.6 — Image Classification Layer
**Lines:** ~1024–1048 (calls `runImageClassificationLayer()`)  
**Input:** `ctx.pageImageUrls[]`, `ctx.damagePhotoUrls[]`  
**Output:** `ctx.imageMetadata[]` (per-image classification: `damage_photo` / `vehicle_overview` / `quotation_scan` / `police_report` / `other`)  
**Sub-stages:**  
- **Stage 2.6:** Direct-URL image classifier (for `damagePhotoUrls`)  
- **Stage 2.6B:** Semantic gate — filters images to only those eligible for Stage 6 (damage analysis). Non-damage images are excluded from Stage 6 to prevent false positives.

---

### Stage 2.7 — Embedded Quote Extraction
**Lines:** ~1049–1066  
**Input:** Images classified as `quotation_scan` by Stage 2.6  
**Output:** Additional `panelBeaterQuotes` rows in DB; `ctx.claimRecord.quotes[]` updated  
**Key behaviour:** Runs quote extraction on quotation scan images. Merges extracted quotes with those already found via OCR (Stage 2). Prefers the more complete/priced version when duplicates are found.

---

### Stage 0b — Evidence Registry Update (post-classification)
**Lines:** ~1049–1066 (immediately after Stage 2.7)  
**Key behaviour:** Updates the evidence registry with classification results (damage photos present/absent, quotation scans found, etc.).

---

### Complexity Gate
**Lines:** ~1049–1066 (after Stage 0b)  
**Output:** `ctx.claimComplexity` (`standard` / `complex` / `fast-track`)  
**Key behaviour:** Classifies the claim tier based on estimated cost, number of damaged components, and fraud indicator count. This gate influences which sub-stages run and at what depth.

---

### Stage 6 — Damage Analysis
**Lines:** ~1067–1130 (calls `runDamageAnalysisStage()`)  
**Input:** Stage-6-eligible images from Stage 2.6B, `ctx.claimRecord`  
**Output:** `ctx.damageAnalysis` (per-component damage list with confidence, severity, and repair recommendation)  
**Key behaviour:** Vision-based analysis of each damage photo. Memory-intensive — a GC hint is issued before this stage. Each component is assessed independently; results are aggregated into a damage manifest.

---

### Stage 6.5A — Vision Geometry Engine (VGE)
**Lines:** ~1338–1456 (within Stage 7 block)  
**Input:** Damage photos with reference objects (licence plates, door handles, tyres)  
**Output:** `ctx.vgeResult` (calibrated crush depth in metres, per-image scale factor, confidence level)  
**Key behaviour:** Detects reference objects of known dimensions in damage photos and uses them to calibrate a real-world scale. Computes calibrated crush depth (deformation depth) from the calibrated scale. If no reference objects are detected, VGE returns `null` and Stage 7 uses raw LLM estimates.

---

### Stage 6.5B — Vision Geometry Reconciliation (VGR)
**Lines:** ~1338–1456  
**Input:** `ctx.vgeResult` (per-image calibrated measurements)  
**Output:** `ctx.vgrResult` (cross-image consensus crush depth, conflict detection)  
**Key behaviour:** Reconciles VGE measurements across multiple images of the same damage. Detects conflicts (e.g., two images showing inconsistent deformation). The consensus value is the authoritative crush depth used by Stage 7.

---

### Stage 7 — Physics & Severity Consensus
**Lines:** ~1154–1292 (calls `runPhysicsStage()`, `runSeverityConsensus()`, `runCausalReasoningEngine()` Pass 1)  
**Input:** `ctx.damageAnalysis`, `ctx.vgrResult`, `ctx.claimRecord`  
**Output:** `ctx.physicsAnalysis` (accident reconstruction), `ctx.severityConsensus`, `ctx.causalVerdict` (Pass 1)  
**Key behaviour:** Reconstructs the accident physics from damage patterns and geometry measurements. Computes consensus vehicle speed at impact. The computed speed is stored in `claims.estimatedSpeedKmh` — this is the authoritative value. The claimant-stated speed (`claims.claimantStatedSpeedKmh`) is preserved separately and never overwritten.

**Authoritative vs. stated values:**

| Field | Column | Source | Immutable? |
|-------|--------|--------|-----------|
| Computed speed | `claims.estimatedSpeedKmh` | Stage 7 physics | No — updated on re-analysis |
| Stated speed | `claims.claimantStatedSpeedKmh` | Stage 3 extraction | **Yes — never overwritten** |
| Crush depth | `physicsTruth.crushDepthM` | Stage 6.5B VGR | No |

---

### Stage 35 — Damage-Physics Coherence Validation
**Lines:** ~1317–1337  
**Input:** `ctx.damageAnalysis`, `ctx.physicsAnalysis`  
**Output:** Coherence score and flag list  
**Key behaviour:** Validates that the damage analysis and physics outputs are mutually consistent (e.g., a high-speed impact should produce more severe damage than a low-speed one). Flags incoherent combinations for human review.

---

### Stage 8 ‖ Stage 9 — Fraud Analysis + Cost Optimisation (PARALLEL)
**Lines:** ~1338–1456  
**Input:** `ctx.physicsAnalysis`, `ctx.damageAnalysis`, `ctx.claimRecord`  
**Output:** `ctx.fraudAnalysis` (Stage 8), `ctx.costAnalysis` (Stage 9)  
**Key behaviour:** These two stages run in a `Promise.all` — they are independent and can execute concurrently. Stage 8 produces a fraud score and indicator list. Stage 9 produces a cost recommendation with parts reconciliation against market benchmarks.

**Note on fraud scoring:** The exact scoring weights and thresholds are intentionally excluded from this manual. See the KINGA Fraud Intelligence Specification (internal document, not in this repository).

---

### Stage 7d — Confidence Aggregation
**Lines:** ~1457–1476  
**Input:** All stage outputs  
**Output:** `ctx.confidenceAggregate` (overall pipeline confidence 0–100)  
**Key behaviour:** Aggregates confidence scores from all stages into a single overall confidence score. A GC hint is issued before this stage to release Stage 8/9 memory.

---

### Post-S8/S9 Parallel Block
**Lines:** ~1477–1705  
**Key behaviour:** Second `Promise.all` containing 11 sub-stages that depend on Stage 8 and Stage 9 outputs:

| Sub-stage | Purpose |
|-----------|---------|
| Stage 7b (Pass 2) | Causal reasoning with fraud + cost scores (~15–30s) |
| Stage 36 | Cost Realism Validation |
| Stage 37 | Causal Chain Builder |
| Stage 38 | Evidence Strength Scorer |
| Stage 40 | Output Realism Validator |
| Stage 41 | Benchmark Deviation Engine |
| Stage 42 | Cross-Engine Consensus Scorer |
| Stage 43 | Physics Deviation Score |
| Stage 44 | Claim Consistency Check |
| Stage 45 | Contradiction Detection Gate |
| Stage 9b | Turnaround Time Analysis |

---

### Cross-Stage Reconciliation Pass
**Lines:** ~1706–1732  
**Key behaviour:** Reconciles outputs across all stages for internal consistency. Resolves conflicts between Stage 6 damage output and Stage 7 physics output.

---

### Claim Truth Layer (Truth Reconciliation Engine)
**Lines:** ~1771–1837  
**Output:** `ctx.claimTruthObject` (Canonical Claim Truth Object — CTO)  
**Key behaviour:** Final adjudication of the claim truth from all stage outputs. The CTO is the single source of truth for all downstream consumers (report generation, decision layer, UI). It resolves conflicts between stages using a priority hierarchy: physics measurements > damage analysis > OCR extraction > claimant statements.

---

### Stage 10 — Report Generation
**Lines:** ~1922–2015  
**Input:** `ctx.claimTruthObject`, all stage outputs  
**Output:** `ctx.report` (`Stage10Output` — structured report sections)  
**Key behaviour:** Deterministic — no LLM calls. Assembles the final human-readable report from structured stage outputs. The report is stored as JSON in `ai_assessments.reportJson` and rendered to HTML/PDF on demand.

---

### Stage 11 — Validated Outcome Recorder
**Lines:** ~2016–2033  
**Key behaviour:** Records validated outcomes for future model improvement. Writes to the learning dataset if the pipeline completed with high confidence.

---

### Stage 11.5 — Case Signature Generator
**Lines:** ~2034–2060  
**Output:** `ctx.caseSignature` (unique fingerprint of this claim's evidence pattern)  
**Key behaviour:** Generates a deterministic signature from the claim's evidence pattern (damage types, incident type, vehicle class, fraud indicators). Used for cross-claim similarity matching.

---

## Partial Resume (Cache)

Stages 6, 7, 8, and 9 support partial resume. If a pipeline run was interrupted after one of these stages completed, a re-run will restore the cached output from `ai_assessments` and skip re-running the stage. This is controlled by the `PartialResume` log messages in the orchestrator.

**Cache invalidation:** The cache is invalidated when `forceRerun=true` is passed to `triggerAiAssessment`, or when the source document changes (re-upload with different SHA-256 hash).

---

## Pipeline Observability

Every pipeline run produces:

1. **`pipelineRunSummary`** — stored in `ai_assessments.pipelineRunSummary`. Contains per-stage health (`ok` / `failed` / `skipped` / `timed_out`), duration in ms, and error messages.
2. **`forensicExecutionLedger`** — stored in `ai_assessments.forensicExecutionLedgerJson`. Court-grade audit record: input hash, output snapshot, model ID, prompt version, and timestamp for each stage.
3. **Stage logs** — written to `ai_assessments.pipelineLogsJson` (ring buffer, last 500 entries). Accessible via the Pipeline Observability page in the insurer portal.
4. **`pipelineCurrentStage`** — live column on `claims` table, updated by `ctx.onStageStart`. Cleared on completion. Drives the "Stage N of 10" progress indicator in the UI.
