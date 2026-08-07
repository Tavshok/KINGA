# KINGA 14-Stage AI Pipeline Flow

**Author:** Tavonga Shoko, Lead Engineer

This diagram shows the complete flow of a claim through the KINGA AI pipeline, from document ingestion to report generation.

```mermaid
flowchart TD
    A([Claim Submitted\nFNOL / WhatsApp / Portal]) --> B[Intake Gate\nQuality check — warns only, never blocks]
    B --> C[Stage 1: Ingestion\nPDF/image parsing, OCR\nstage-1-ingestion.ts]
    C --> D[Stage 2: Extraction\nRaw field extraction\nstage-2-extraction.ts]
    D --> E[Stage 3: Structured Extraction\nVehicle · Incident · Claimant\nstage-3-structured-extraction.ts]
    E --> F[Stage 4: Validation\nCompleteness checks · Temporal guards\nstage-4-validation.ts]
    F --> G[Stage 5: Assembly\nMerge all extracted data\nstage-5-assembly.ts]
    G --> H[Stage 6: Damage Analysis\nComponent detection · Zone mapping\nstage-6-damage-analysis.ts]
    H --> H1[Stage 6.5a: VGE\nVehicle Geometry Engine\nstage-6-5a-vge.ts]
    H --> H2[Stage 6.5b: VGR\nVehicle Geometry Reconstruction\nstage-6-5b-vgr.ts]
    H --> H3[Stage 6.5c: SLPE\nStructural Load Path Engine\nstage-6-5c-slpe.ts]
    H1 & H2 & H3 --> I[Stage 7: Physics Analysis\nSpeed estimation · Impulse-momentum\nCoefficient of friction\nstage-7-physics.ts]
    I --> I2[Stage 7b: Causal Reasoning\nCollision direction · Mechanism\nstage-7b-causal-reasoning.ts]
    I2 --> J[Stage 8: Fraud Scoring\nComponent · Behavioural · Network signals\nstage-8-fraud.ts]
    J --> K[Stage 9: Cost Intelligence\nQuote extraction · Composite optimisation\nT1 Benchmark / T2 Adjusted / T3 Lowest Quote\nstage-9-cost.ts]
    K --> K2[Stage 9.5: CGI\nCrash Geometry Intelligence\nStructural consistency\nstage-9-5-cgi.ts]
    K2 --> K3[Stage 9b: Turnaround\nRepair time estimation\nstage-9b-turnaround.ts]
    K3 --> L[Stage 10: Report Generation\nCL · CI · FR reports triggered\nstage-10-report.ts]
    L --> M[Stage 10i: Interpretation\nPlain-language decision summaries\nstage-10i-interpretation.ts]
    M --> N([Assessment Complete\nReports available · Notifications sent])

    style A fill:#1e3a5f,color:#fff
    style N fill:#1e5f3a,color:#fff
    style B fill:#7a4f00,color:#fff
    style I fill:#3a1e5f,color:#fff
    style J fill:#5f1e1e,color:#fff
    style K fill:#1e4f5f,color:#fff
    style L fill:#1e5f4f,color:#fff
```

## Key Design Principles

**Resume support:** If the pipeline is interrupted at any stage, `loadCompletedStages()` allows it to skip already-completed stages on restart. Each stage writes its output to the DB before the next stage begins.

**Gate policy:** The intake gate checks quality conditions (photo count, document completeness, description length) but **never blocks** the pipeline. It warns, logs to the notification centre, and allows the pipeline to proceed.

**Concurrency:** A semaphore (`MAX_CONCURRENT_PIPELINES = 1`) prevents multiple pipelines from running simultaneously on the same server instance. Concurrent claims are queued.

**Benchmark learning:** After Stage 9 (Cost), selected prices are written back to `component_repair_outcomes`. This grows the benchmark database with every claim processed, making future cost optimisation more accurate.

## Stage Output Storage

Each stage writes its output to `ai_assessments` as a JSON column:

| Stage | Column in ai_assessments |
|---|---|
| 1–3 | `ingestion_json`, `extraction_json`, `structured_json` |
| 4–5 | `validation_json`, `assembly_json` |
| 6 | `damage_analysis_json`, `enriched_photos_json` |
| 7 | `physics_analysis_json`, `cross_validation_json` |
| 8 | `fraud_analysis_json` |
| 9 | `cost_intelligence_json` |
| 9.5 | `cgi_analysis_json` |
| 10i | `interpretation_json` |
