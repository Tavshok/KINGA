# Claim Truth Layer (CTL)

## Purpose

The Claim Truth Layer is the **single source of truth** for all downstream decision engines.
It runs AFTER all extraction stages complete and BEFORE any decision/scoring/report stage begins.

Every engine that makes a decision, scores a risk, or generates a report MUST read from the CTL —
never from its own partial extraction or a different engine's output.

## Business Goals Served

| # | Goal | What CTL Provides |
|---|------|-------------------|
| 1 | Complete Claim Understanding | Unified evidence inventory — what's actually in the file |
| 2 | Fraud Intelligence | Consistent signals across all dimensions (physics, timeline, history) |
| 3 | Cost Intelligence | Single authoritative cost basis — correct quote, correct benchmark |
| 4 | Decision Support | One coherent claim picture → one coherent decision |
| 5 | Risk Quantification | All risk dimensions scored from the same data |
| 6 | Recovery Opportunities | Subrogation leads, policy exclusions, excess — surfaced proactively |
| 7 | Audit Trail | Every CTL field traces back to source (stage, page, confidence) |

## Architecture Position

```
┌─────────────────────────────────────────────────────────┐
│  EXTRACTION STAGES (Stages 1-5)                         │
│  ├── Stage 1: PDF parsing, page extraction              │
│  ├── Stage 2: Image extraction & classification         │
│  ├── Stage 3: Structured data extraction (LLM)          │
│  ├── Stage 4: Validation & cross-reference              │
│  └── Stage 5: Assembly (claimRecord)                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  ★ CLAIM TRUTH LAYER (CTL)                              │
│                                                         │
│  Resolves conflicts between extraction outputs.         │
│  Produces a single unified ClaimTruth object.           │
│  All downstream engines read ONLY from ClaimTruth.      │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  DECISION STAGES (Stages 7-10)                          │
│  ├── Stage 7: Physics & consistency                     │
│  ├── Stage 8: Fraud scoring                             │
│  ├── Stage 9: Cost analysis & optimisation              │
│  └── Stage 10: Report generation                        │
│                                                         │
│  + Intelligence Enforcement (post-pipeline)             │
│  + Phase 2 Decision Engine (post-pipeline)              │
└─────────────────────────────────────────────────────────┘
```

## ClaimTruth Contract

```typescript
interface ClaimTruth {
  // ─── EVIDENCE INVENTORY ───────────────────────────────────────
  evidence: {
    damagePhotos: { url: string; pageRef: number; classification: string }[];
    quotationScans: { url: string; pageRef: number; repairerName: string | null }[];
    documents: { type: string; pageRef: number; summary: string }[];
    totalPages: number;
    completenessScore: number; // 0-100, based on what's present vs expected
  };

  // ─── TIMELINE ─────────────────────────────────────────────────
  timeline: {
    incidentDate: string | null;          // from claim form / police report
    claimRegistrationDate: string | null;  // from assessor inspection / insurer records (NOT system ingestion)
    assessorInspectionDate: string | null; // from assessor report
    authorizationDate: string | null;      // from insurer authorization letter
    reportGenerationDate: string;          // today (KINGA's processing date)
    daysToLodge: number | null;           // incidentDate → claimRegistrationDate (null if can't determine)
    lateSubmission: boolean;              // true only if daysToLodge > policy limit AND dates are reliable
    lateSubmissionSource: string | null;  // explains which dates were used
  };

  // ─── COST BASIS ───────────────────────────────────────────────
  costBasis: {
    // All quotes found in the claim file
    quotes: {
      repairerName: string;
      totalUsd: number;
      isAssessorSelected: boolean;   // true if assessor/insurer chose this repairer
      source: string;                // "extracted_quote_page" | "assessor_report" | "claim_form"
      pageRef: number | null;
    }[];
    // KINGA's AI benchmark (independent estimate)
    kingaEstimateUsd: number;
    kingaEstimateSource: string;     // "learning_db" | "llm_estimate" | "severity_model"
    // Optimised cost = lowest of {all quotes, KINGA estimate}
    optimisedCostUsd: number;
    optimisedCostSource: string;     // which figure was lowest and why
    // Insurer authorized/settled amount (optional — only present in retrospective/test files)
    authorizedAmountUsd: number | null;
    // Cost verdict logic (production: no authorization available):
    // - Compare each quote vs KINGA estimate
    // - If lowest quote > KINGA estimate by >10% → OVERPRICED (negotiate down)
    // - If lowest quote <= KINGA estimate → FAIR
    // - If lowest quote < KINGA estimate by >15% → UNDERPRICED (verify scope)
    // - If authorized exists (retrospective): confirm insurer negotiated well
    costVerdict: 'FAIR' | 'OVERPRICED' | 'UNDERPRICED' | 'INSUFFICIENT_DATA';
    costVerdictExplanation: string;
    // Negotiation potential: how much the insurer could save
    negotiationSavingUsd: number;  // optimisedCost - lowestQuote (if KINGA is lower)
    // Deviation: each quote vs KINGA estimate (for reporting)
    quoteVsEstimateDeviation: { repairerName: string; quoteUsd: number; deviationPercent: number }[];
  };

  // ─── VEHICLE ──────────────────────────────────────────────────
  vehicle: {
    make: string;
    model: string;
    year: number | null;
    vin: string | null;
    registration: string | null;
    marketValueUsd: number;
    marketValueSource: string;       // "kinga_benchmark" | "assessor_report" | "book_value"
    repairToValueRatio: number;      // authoritativeCostUsd / marketValueUsd
    writeOffThreshold: number;       // typically 0.65-0.75
    isEconomicWriteOff: boolean;
  };

  // ─── FRAUD SIGNALS ────────────────────────────────────────────
  fraudSignals: {
    score: number;                   // 0-100
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    indicators: { signal: string; weight: number; source: string }[];
    // Physics anomalies that require investigation (NOT suppressed)
    physicsAnomalies: {
      type: string;                  // "airbag_deployment_vs_delta_v" | "speed_vs_damage" etc
      description: string;
      severity: 'INVESTIGATE' | 'ADVISORY';
      evidence: string;              // what was observed
      expectation: string;           // what physics predicts
    }[];
  };

  // ─── POLICY & RECOVERY ────────────────────────────────────────
  policyAndRecovery: {
    exclusions: { description: string; source: string; pageRef: number | null }[];
    subrogationLeads: { party: string; basis: string; source: string }[];
    excessApplicable: number | null;
    policyNumber: string | null;
    insurer: string | null;
  };

  // ─── POLICE & THIRD PARTY ────────────────────────────────────
  policeReport: {
    caseNumber: string | null;
    station: string | null;
    officerFindings: string | null;
    chargedParty: string | null;     // who police found responsible
    witnessStatements: boolean;      // true/false — NOT flagged as missing for single-vehicle rural accidents
    witnessExpectationRealistic: boolean; // context-aware: rural single-vehicle = unrealistic to expect witnesses
  };

  // ─── DECISION ─────────────────────────────────────────────────
  // This is the SINGLE authoritative decision. Both reports must use this.
  decision: {
    recommendation: 'APPROVE' | 'REVIEW' | 'ESCALATE';
    primaryReason: string;
    confidence: number;              // 0-100
    reviewTriggers: string[];        // what specifically needs human review
    approvalConditions: string[];    // conditions that must be met before payment
  };

  // ─── METADATA ─────────────────────────────────────────────────
  meta: {
    truthLayerVersion: string;
    generatedAt: string;
    sourceStages: string[];          // which stages contributed data
    conflictsResolved: { field: string; chosen: string; rejected: string; reason: string }[];
  };
}
```

## Resolution Rules

The CTL resolves conflicts using these priority rules:

### Cost Resolution (Production Mode — Pre-Authorization)
1. Extract ALL quotes from the claim file (every repairer found)
2. Generate KINGA's own AI estimate (benchmark)
3. Optimised cost = lowest of {all quotes, KINGA estimate}
4. Compare lowest quote vs KINGA estimate:
   - lowest quote > KINGA estimate by >10% → OVERPRICED (advise negotiation)
   - lowest quote <= KINGA estimate → FAIR (quotes are reasonable)
   - lowest quote < KINGA estimate by >15% → UNDERPRICED (verify repair scope is complete)
5. Negotiation saving = KINGA estimate - lowest quote (when KINGA is lower)
6. If authorized amount exists (retrospective/test): validate insurer's negotiation was effective
7. The cost verdict drives the recommendation — OVERPRICED triggers REVIEW, FAIR supports APPROVE

### Timeline Resolution
1. Assessor inspection date = proxy for claim registration (claim was lodged before inspection)
2. Authorization date = proof claim was processed by that date
3. NEVER use KINGA system ingestion date as claim lodgement date
4. If no document-derived date available → suppress late submission flag entirely

### Evidence Resolution
1. Image classifier output (Stage 2.6) is authoritative for photo count
2. If classifier didn't run (bypass/cache) → use Stage 1 embedded image count
3. Quote pages identified by classifier override heuristic-only classification
4. "No photos submitted" can ONLY be stated if classifier confirms 0 damage photos

### Physics Anomaly Resolution
1. If airbags deployed (from claim form/photos) AND delta-V < deployment threshold → INVESTIGATE (not suppress)
2. If damage exceeds what physics predicts → INVESTIGATE
3. Advisory-only for: minor discrepancies within measurement uncertainty

### Witness Expectation
1. Single-vehicle accident on rural/remote road → witnessExpectationRealistic = false
2. Multi-vehicle accident in urban area → witnessExpectationRealistic = true
3. Only flag "no witnesses" as a gap when expectation is realistic

### Decision Resolution
1. ONE decision for the entire claim — both reports use the same recommendation
2. Decision derives from: fraud score + cost verdict + physics anomalies + evidence completeness
3. If any dimension triggers ESCALATE → whole claim escalates
4. If cost triggers REVIEW but fraud is LOW → REVIEW (not APPROVE)
5. Never produce contradictory recommendations across reports

## Integration Points

The CTL is consumed by:
- `stage-8-fraud.ts` → reads `fraudSignals`, `timeline`, `policeReport`
- `stage-9-cost.ts` → reads `costBasis`, `vehicle`
- `stage-10-report.ts` → reads entire `ClaimTruth` for report assembly
- `intelligence-enforcement.ts` → reads `costBasis`, `fraudSignals`, `decision`
- `phase2-decision-engine.ts` → reads `decision` (must match, not override)
- `ForensicAuditReport.tsx` → renders from `ClaimTruth.decision` (single source)
- `KingaClaimsReport.tsx` → renders from `ClaimTruth.decision` (same source)
