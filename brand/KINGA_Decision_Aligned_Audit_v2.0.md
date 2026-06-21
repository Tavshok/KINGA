# KINGA Platform — Decision-Aligned Portal Realignment Audit v2.0

**Document Classification:** Internal Product Engineering  
**Prepared by:** Manus AI — Lead Product Engineering Analysis  
**Date:** June 2026  
**Scope:** All 11 role-based portals — Claims Manager, Executive, Claims Processor, Risk Manager, Admin, Panel Beater, Assessor, Claimant, Fleet Manager, Recovery, Insurer Admin  
**Methodology:** 12-phase decision-first audit (Phase 0–11) per the KINGA Portal Realignment Specification, June 2026  
**Governing Constraint:** Every finding traces to a Phase 0 decision or question. "Looks cleaner" is not a justification without a named decision it serves.

---

## Executive Summary

This audit applies a decision-first lens to all 11 KINGA portals. Rather than beginning with the existing UI, each portal's analysis starts with an independent Role & Decision Inventory (Phase 0) — a definition of what the role owner must decide daily, weekly, and monthly, their escalation and approval responsibilities, and the 10 questions they must answer within 10 seconds of opening the portal. Only after this inventory is locked does the audit compare the existing implementation against it.

The platform's prior audit (v1.0, June 2026) found average Design Maturity of 6.4/10 and Command Centre Maturity of 5.1/10. This audit finds the underlying cause: the portals were built around available data rather than around the decisions their role owners make. The result is a platform that is operationally capable but decision-misaligned — information is present but not organised to answer the questions that matter most to each role.

The single most consequential gap across the platform is the absence of SLA deadline visibility on claim and case rows. This was identified in v1.0 (scoring 3.0/10) and remains unresolved. A single shared `SLADeadlineChip` component, applied to every claim row across every portal, would close this gap in one sprint.

The second most consequential gap is the absence of a persistent Critical Attention Zone — a section that surfaces the most urgent items requiring action today, visible without navigating into tabs. The Claims Manager, Claims Processor, Risk Manager, and Assessor portals all require this.

---

## Platform Inventory

| Portal | File | Lines | Tabs | tRPC Queries | Mutations | SLA Visible | AI Surfaced |
|---|---|---|---|---|---|---|---|
| Claims Manager | ClaimsManagerDashboard.tsx | ~730 | 7 (grouped) | 8+ | 5+ | Partial | Yes |
| Executive | ExecutiveDashboard.tsx | ~900 | 4 | 6+ | 1 | No | Yes |
| Claims Processor | ClaimsProcessorDashboard.tsx | ~1200 | Multiple | 10+ | 6+ | No | Yes |
| Risk Manager | RiskManagerDashboard.tsx | ~500 | 4 | 6+ | 2+ | No | Yes |
| Admin | AdminDashboard.tsx | ~350 | 3 | 4+ | 2+ | No | No |
| Panel Beater | PanelBeaterDashboard.tsx | ~600 | 3 | 5+ | 3+ | No | No |
| Assessor | AssessorDashboard.tsx | ~400 | 3 | 4+ | 2+ | No | No |
| Claimant | ClaimantDashboard.tsx | ~620 | 0 | 4+ | 1+ | No | No |
| Fleet Manager | FleetManagerDashboard.tsx | ~600 | 3 | 4+ | 1+ | No | No |
| Recovery | RecoveryPortal.tsx | ~360 | Queue cards | 3+ | 0 | Partial | No |
| Insurer Admin | InsurerAdminDashboard.tsx | ~491 | 0 | 4+ | 1+ | No | Partial |

---

## PORTAL 1 — CLAIMS MANAGER

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Claims Manager is the operational command authority for the claims pipeline. Their role is to ensure claims move through the workflow at the correct pace, with the correct decisions made at each gate, and that exceptions — fraud, high-value, disputed, stalled — are identified and resolved before they become liabilities.

**Daily decisions this role makes:**

The Claims Manager decides which claims in the intake queue require immediate triage versus standard processing. They decide whether to escalate a claim to fraud review, dispute resolution, or senior management. They approve or reject technical assessments submitted by assessors. They authorise or defer financial decisions on claims above threshold. They decide whether a stalled claim requires a send-back to the processor or assessor, or whether it should be escalated. They monitor queue depth and decide whether to redistribute workload across processors.

**Weekly decisions:**

The Claims Manager reviews the portfolio for systemic patterns — are fraud rates trending up, are certain repair shops generating disproportionate claims, is the average settlement time increasing? They decide whether to adjust escalation thresholds or approval limits. They review the rework rate and decide whether send-backs indicate a training issue with specific processors or assessors.

**Monthly decisions:**

The Claims Manager produces or reviews performance reports for the insurer. They decide whether portfolio risk exposure requires a policy change. They review the fraud prevention record and decide whether detection thresholds need adjustment.

**Escalation responsibilities:** Claims Manager is the first escalation point for all processor and assessor decisions. They escalate to senior management or the insurer for claims above a defined financial threshold or with confirmed fraud.

**Approval responsibilities:** Technical approval of assessed claims; financial decision authorisation; escalation routing decisions.

**Governance responsibilities:** Ensures all claims transition through correct workflow states with audit trail. Enforces SLA compliance across the pipeline. Monitors fraud detection rate and ensures flagged claims are not approved without review.

**The 10 questions this role must answer within 10 seconds:**

1. How many claims are in the intake queue right now?
2. How many claims are breaching or approaching their SLA deadline?
3. Which claims require my approval or decision today?
4. Are there any fraud-flagged claims awaiting my review?
5. What is the current average processing time, and is it trending up or down?
6. How many claims have been escalated this week, and for what reasons?
7. Which processor or assessor has the highest backlog right now?
8. Are there any high-value claims (above threshold) pending decision?
9. What is the current fraud detection rate, and is it within acceptable range?
10. Are there any stalled claims (no movement in 48+ hours) that need intervention?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Daily queue triage | Fully | `IntakeQueueTab`, `ReviewQueueTab`, `ActiveClaimsTab` in `ClaimsManagerCommandCentre` |
| Escalation decisions | Fully | `trpc.claims.escalateClaim` mutation; `EscalationCentre` component |
| Technical approval | Fully | `trpc.claims.approveClaim` mutation; `ApprovalQueue` tab |
| Financial authorisation | Fully | `trpc.claims.financialApproval` mutation; `FinancialDecisionQueue` tab |
| Fraud review | Partially | `FraudAlertsTab` exists; no persistent fraud alert banner on landing |
| Workload redistribution | Not At All | No per-processor workload view; no reassignment action |
| Portfolio pattern review | Partially | `ExecutiveAnalyticsCharts` in Reports tab; not surfaced on landing |
| SLA compliance monitoring | Not At All | No SLA deadline chips on any claim row; no SLA breach counter in KPI strip |
| Rework rate monitoring | Partially | `ReworkIntelligence` component exists but placed in a sub-tab |
| Send-back decisions | Partially | Send-back action exists in claim detail; not visible from dashboard |

**Phase 1 Score: 6.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Intake queue count | Supported | KPI strip shows "In Queue" count |
| Q2: SLA breaches | **Unsupported** | No SLA deadline chips; no breach counter anywhere |
| Q3: Claims requiring my decision | Partially | Approval queue tab exists but requires navigation |
| Q4: Fraud-flagged claims | Partially | Fraud Alerts tab exists; no persistent banner |
| Q5: Average processing time trend | Partially | Available in Reports tab; not on landing |
| Q6: Escalations this week | Partially | Escalation Centre component exists; count not in KPI strip |
| Q7: Per-processor backlog | **Unsupported** | No per-processor workload view |
| Q8: High-value claims pending | Partially | High-value threshold filter exists in approval queue |
| Q9: Fraud detection rate | Partially | Available in Risk Analytics tab; not on landing |
| Q10: Stalled claims | **Unsupported** | No stalled claim detection or surfacing |

**Operational Awareness Score: 5.5/10**  
Three questions (Q2, Q7, Q10) are completely unsupported. These represent the highest-impact gaps.

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Operational Dashboard (should be Command Centre)**

The Claims Manager portal has the data and procedures of a Command Centre but is structured as an Operational Dashboard. The distinction is critical: an Operational Dashboard organises information by category (queues, reports, analytics); a Command Centre organises information by urgency and decision type, with the most time-sensitive items always visible without navigation.

The current portal requires the Claims Manager to navigate into 7 tabs to access their full operational picture. A Command Centre would surface the Critical Attention Zone (fraud flags, SLA breaches, stalled claims, high-value pending) on the landing view, with tabs used only for depth.

**Justification:** The KPI strip (6 metrics) is well-designed. The tab structure (Workflow / Oversight / Admin) is logically grouped. However, the landing view (Intake Queue tab) does not surface the most urgent items — a fraud-flagged claim in the Fraud Alerts tab is invisible until the manager navigates there. The `AttentionRequiredPanel` component exists but is placed inside a tab rather than above the tab bar.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Intake → Triage | Yes | Yes | Yes (escalate mutation) | Yes (state machine) | Yes (audit log) |
| Triage → Assessment | Yes | Partially | Yes | Yes | Yes |
| Assessment → Technical Approval | Yes | Yes | Yes | Yes | Yes |
| Technical Approval → Financial Decision | Yes | Yes | Yes | Yes | Yes |
| Financial Decision → Settlement | Yes | Yes | Yes | Yes | Yes |
| Fraud Escalation | Partially | Yes | Yes | Yes | Yes |
| Dispute Resolution | Partially | Yes | Yes | Yes | Yes |
| Send-back / Rework | Partially | Partially | No persistent view | Yes | Yes |
| Stalled Claim Recovery | **No** | **No** | **No** | N/A | N/A |

**Workflow Governance Score: 7.0/10**  
The core approval chain is well-governed. The gaps are stalled claim detection and send-back visibility from the dashboard.

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Queue counts | Yes | KPI strip |
| Queue age | No | No "oldest claim" or average age indicator |
| SLA breach visibility | **No** | Single worst gap — no SLA chips, no breach counter |
| Bottleneck detection | No | No stage-level bottleneck indicator |
| Backlog trend | Partial | Available in charts, not on landing |
| Per-user workload | **No** | No processor/assessor workload breakdown |
| Rework tracking | Partial | `ReworkIntelligence` component exists |
| Escalation tracking | Partial | `EscalationCentre` component exists |

**Operational Queue Maturity Score: 4.5/10**  
SLA visibility is absent. This was the platform's worst dimension in v1.0 and remains unresolved.

---

### Phase 6 — Actionability Audit (Widget Actionability Matrix)

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip | Situational awareness | None | N/A | Click-through to relevant queue |
| Intake Queue tab | Triage decision | View claim | Yes | Assign to processor |
| Review Queue tab | Assessment review | Approve / Request info / Reject | Yes (`approveClaim`) | SLA chip on each row |
| Active Claims tab | Monitor progress | View | Yes | Stalled claim flag |
| Fraud Alerts tab | Fraud decision | View + escalate | Yes (`escalateClaim`) | Persistent banner when count > 0 |
| Fleet Approvals tab | Fleet claim approval | Approve / Reject | Yes | — |
| Processed tab | Audit review | View | Yes | — |
| Notifications tab | Communication | Read | Yes | — |
| AttentionRequiredPanel | Urgent triage | View | Yes | Should be above tab bar |
| EscalationCentre | Escalation review | View escalated claim | Yes | Escalation count in KPI strip |
| ReworkIntelligence | Send-back analysis | View | Yes | Send-back action from dashboard |

---

### Phase 7 — Reports & Intelligence Review

| Report | Current Placement | Correct Placement | Gap |
|---|---|---|---|
| Claims Summary | Reports Centre tab | Dashboard-level | Buried 2 clicks |
| Fraud Analytics | Reports Centre tab | Dashboard-level | Buried 2 clicks |
| Assessor Performance | Reports Centre tab | Section-level (Oversight) | Correct level, wrong location |
| Settlement Analysis | Reports Centre tab | Portfolio-level | Correct |
| Cost Comparison | Reports Centre tab | Per-claim | Misplaced — should be in claim detail |
| Executive Summary | Reports Centre tab | Executive-only | Misplaced — should not be in Claims Manager |

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Status | Evidence |
|---|---|---|
| Fraud risk scoring | AI Used | `fraudRiskScore` surfaced in claim rows |
| Damage assessment | AI Available | `AiAssessButton` in claim rows |
| Cost estimation | AI Available | `estimatedCost` from AI pipeline |
| Confidence score | AI Used | Displayed in claim detail |
| Rework detection | AI Used | `ReworkIntelligence` component |
| Portfolio fraud intelligence | AI Used | `getRiskPortfolioAnalytics` query |
| SLA breach prediction | AI Not Surfaced | No predictive SLA component |
| Stalled claim detection | AI Not Surfaced | No anomaly detection for stalled claims |

**AI Utilisation Score: 6.5/10**

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Claims Manager | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent with Executive, Processor |
| KPI design | 6-metric strip | Executive has 8-metric strip — different count |
| Tab bar | Custom grouped button tabs | Executive uses shadcn Tabs — different component |
| Alert design | AttentionRequiredPanel in tab | Recovery uses banner above content — inconsistent placement |
| Escalation pattern | `escalateClaim` mutation | Processor uses same — consistent |
| Queue pattern | Custom button tabs | Recovery uses card-based queue — inconsistent |
| Audit trail | Via claim detail | Consistent across portals |

---

### Portal 1 Summary

| Phase | Score | Top Gap |
|---|---|---|
| Phase 1 (Role Validation) | 6.5/10 | No workload redistribution; no SLA monitoring |
| Phase 2 (Operational Awareness) | 5.5/10 | Q2 (SLA), Q7 (workload), Q10 (stalled) unsupported |
| Phase 3 (Architecture) | Operational Dashboard | Should be Command Centre |
| Phase 4 (Workflow) | 7.0/10 | Stalled claim recovery absent |
| Phase 5 (Queue Intelligence) | 4.5/10 | No SLA chips, no per-user workload |
| Phase 6 (Actionability) | 7.0/10 | AttentionRequiredPanel misplaced |
| Phase 7 (Reports) | 6.0/10 | Key reports buried 2+ clicks |
| Phase 8 (AI) | 6.5/10 | SLA prediction and stalled detection absent |
| Phase 9 (Cross-Portal) | 6.0/10 | Tab component inconsistency with Executive |

**Top 5 Gaps (ranked by decision-impact):**

1. **SLA deadline chips absent from all claim rows** — supports Q2 (SLA breaches) and is the platform's single worst-scoring dimension. Fix: add shared `SLADeadlineChip` component to every claim row.
2. **No per-processor/assessor workload view** — supports Q7. Fix: add `WorkloadDistributionPanel` to Oversight section.
3. **No stalled claim detection** — supports Q10. Fix: add stalled claim filter (no state change in 48h) to `AttentionRequiredPanel`.
4. **AttentionRequiredPanel placed inside a tab** — critical alerts are invisible on landing. Fix: move above tab bar as a persistent Critical Attention Zone.
5. **Fraud alert count not in KPI strip** — supports Q4. Fix: add fraud-flagged count to KPI strip with click-through to Fraud Alerts tab.

**Recommended Component Changes:**
- Add `SLADeadlineChip` to every claim row in IntakeQueueTab, ReviewQueueTab, ActiveClaimsTab
- Move `AttentionRequiredPanel` above the tab bar
- Add `WorkloadDistributionPanel` component to Oversight section
- Add stalled claim detection to `AttentionRequiredPanel` (claims with no state change in 48h)
- Add fraud-flagged count to KPI strip with `onClick` navigating to Fraud Alerts tab

---

## PORTAL 2 — EXECUTIVE

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Executive role owner is the strategic authority for the insurance operation. Their decisions are not operational — they do not approve individual claims. Their decisions concern portfolio health, financial exposure, operational efficiency, and risk strategy.

**Daily decisions:** The Executive monitors whether the portfolio is performing within acceptable parameters. They decide whether any metric (fraud rate, settlement ratio, processing time) has moved outside tolerance and requires operational intervention. They decide whether to escalate a systemic issue to the board or to the Claims Manager.

**Weekly decisions:** The Executive reviews trend data — is the fraud rate increasing, is the average claim value changing, is the processing pipeline backing up? They decide whether operational KPIs indicate a structural problem or a transient spike. They review the AI confidence score distribution and decide whether the model is performing reliably.

**Monthly decisions:** The Executive reviews portfolio-level financial performance — total claims cost, recovery rate, fraud prevention value, net loss ratio. They decide whether to adjust underwriting parameters or escalation thresholds. They review the platform's operational efficiency against benchmarks.

**Escalation responsibilities:** The Executive is the final escalation point for claims above the highest financial threshold. They escalate to the board for systemic risk events.

**Approval responsibilities:** None at claim level. Strategic approval of policy changes, threshold adjustments, and operational interventions.

**Governance responsibilities:** Ensures the platform is operating within regulatory and policy parameters. Reviews audit trail for systemic compliance.

**The 10 questions this role must answer within 10 seconds:**

1. What is the total active claims value in the portfolio right now?
2. What is the current fraud detection rate, and is it within acceptable range?
3. What is the average claim processing time this month, and is it trending up or down?
4. How many claims are currently in the pipeline at each stage?
5. What is the total financial exposure from high-risk claims?
6. What is the AI model's average confidence score this month?
7. What is the recovery rate on settled claims?
8. Are there any systemic bottlenecks in the pipeline right now?
9. What is the month-on-month change in total claims cost?
10. Are there any claims above the executive escalation threshold awaiting decision?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Portfolio health monitoring | Fully | 8-metric KPI strip; `getKPIs` query |
| Fraud rate monitoring | Fully | Fraud rate KPI; trend chart in Analytics tab |
| Processing time monitoring | Fully | Avg processing time KPI |
| Financial exposure review | Partially | Total exposure KPI; no drill-down by risk tier |
| AI model performance review | Partially | Confidence gauge in Analytics tab; not in KPI strip |
| Recovery rate monitoring | Partially | Recovery rate KPI; no trend |
| Bottleneck detection | Partially | Operational Health tab; not on landing |
| Strategic escalation | Not At All | No executive escalation queue or threshold alert |
| Policy change decisions | Not At All | No policy parameter controls |
| Benchmark comparison | Not At All | No external benchmark data |

**Phase 1 Score: 6.0/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Total active claims value | Supported | KPI strip |
| Q2: Fraud detection rate | Supported | KPI strip |
| Q3: Average processing time trend | Partially | KPI shows current value; trend requires Analytics tab |
| Q4: Pipeline stage counts | Partially | Available in Operational Health tab; not on landing |
| Q5: High-risk financial exposure | Partially | Exposure KPI; no tier breakdown |
| Q6: AI confidence score | Partially | Confidence gauge in Analytics tab; not in KPI strip |
| Q7: Recovery rate | Supported | KPI strip |
| Q8: Systemic bottlenecks | **Unsupported** | No bottleneck indicator on landing |
| Q9: Month-on-month cost change | Partially | Comparison strip exists; requires scrolling |
| Q10: Executive threshold claims | **Unsupported** | No executive escalation queue |

**Operational Awareness Score: 5.5/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Executive Dashboard (correctly classified)**

The Executive portal is correctly structured as an Executive Dashboard — it presents portfolio-level KPIs, trend charts, and comparative analytics without exposing operational workflow controls. The information hierarchy is appropriate: KPI strip → comparison strip → charts → deep analytics.

The primary gap is that the landing view is too dense — the Overview tab contains four distinct sections (KPI strip, comparison strip, charts, search/analytics) stacked vertically without sufficient visual separation, making it difficult to scan quickly.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Portfolio monitoring | Yes | No (read-only) | N/A | Yes | Yes |
| Fraud portfolio review | Yes | No | N/A | Yes | Yes |
| Executive escalation queue | **No** | **No** | **No** | N/A | N/A |
| AI model performance | Partially | No | N/A | N/A | N/A |
| Recovery portfolio | Partially | No | N/A | Yes | Yes |

**Workflow Governance Score: 5.5/10**  
The Executive portal is intentionally read-only for most workflows, which is correct. The gap is the absence of an executive escalation queue for claims above threshold.

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Portfolio queue counts | Yes | KPI strip |
| SLA breach visibility | **No** | No SLA metrics in executive view |
| Bottleneck detection | Partial | Operational Health tab |
| Fraud exposure | Yes | KPI strip |
| AI performance | Partial | Confidence gauge |
| Recovery tracking | Partial | KPI strip |

**Operational Queue Maturity Score: 5.0/10**  
The Executive portal is not primarily a queue management tool, but the absence of SLA breach visibility at the portfolio level means the Executive cannot answer "are we meeting our SLA commitments?" without navigating to the Claims Manager portal.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip (8 metrics) | Portfolio awareness | None | N/A | Click-through to drill-down |
| Comparison strip | Trend awareness | None | N/A | — |
| Analytics charts | Trend analysis | None | N/A | Export |
| Confidence gauge | AI performance | None | N/A | — |
| Global Search | Claim lookup | Navigate to claim | Yes | — |
| Fast-Track Analytics | Deep analysis | Query | Yes | — |
| Operational Health tab | Bottleneck review | None | N/A | Drill-down to stage |
| ROI tab | Financial review | None | N/A | Export |

---

### Phase 7 — Reports & Intelligence Review

All reports in the Executive portal are appropriately placed at portfolio or executive level. No reports are misplaced. The gap is the absence of an export action on the analytics charts.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Status | Evidence |
|---|---|---|
| Portfolio fraud intelligence | AI Used | Fraud rate KPI; trend chart |
| AI confidence score | AI Used | Confidence gauge |
| Cost estimation accuracy | AI Not Surfaced | No AI vs actual cost comparison |
| Fraud prevention value | AI Used | Fraud prevented KPI |
| Predictive analytics | AI Not Surfaced | No forecast or projection |
| Anomaly detection | AI Not Surfaced | No systemic anomaly alert |

**AI Utilisation Score: 5.5/10**

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Executive | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent |
| KPI design | 8-metric strip | Claims Manager has 6-metric strip |
| Tab bar | shadcn `Tabs` component | Claims Manager uses custom button tabs |
| Alert design | No persistent alerts | Claims Manager has `AttentionRequiredPanel` |
| Queue pattern | No queue | N/A |

---

### Portal 2 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No executive escalation queue** — supports Q10. The Executive cannot see claims above threshold awaiting their decision. Fix: add `ExecutiveEscalationQueue` component surfacing claims above the executive approval threshold.
2. **No SLA portfolio metric** — supports Q8. Fix: add SLA compliance rate (% of claims within SLA) to KPI strip.
3. **No bottleneck indicator on landing** — supports Q8. Fix: promote the stage-level bottleneck indicator from Operational Health tab to the Overview landing.
4. **AI confidence score not in KPI strip** — supports Q6. Fix: add AI confidence score to KPI strip.
5. **No trend context on processing time KPI** — supports Q3. Fix: add sparkline or delta indicator to processing time KPI tile.

**Recommended Component Changes:**
- Add `ExecutiveEscalationQueue` component to Overview tab (claims above threshold)
- Add SLA compliance rate metric to KPI strip
- Add AI confidence score to KPI strip
- Add sparkline to processing time KPI tile
- Promote bottleneck indicator from Operational Health tab to Overview landing

---

## PORTAL 3 — CLAIMS PROCESSOR

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Claims Processor is the intake and triage authority. They are the first human in the claims pipeline. Their decisions determine whether a claim is valid, complete, and correctly categorised before it enters the assessment and approval chain.

**Daily decisions:** The Processor decides whether a submitted claim has sufficient documentation to proceed to assessment. They decide whether to request additional information from the claimant. They decide whether a claim shows early fraud indicators that warrant immediate escalation. They decide the priority tier of each claim (standard, urgent, high-value). They decide whether to assign a claim to a specific assessor or allow automatic assignment.

**Weekly decisions:** The Processor reviews their own throughput and rework rate. They decide whether a pattern of incomplete submissions from a specific claimant or broker warrants a note or escalation.

**Escalation responsibilities:** First escalation point for fraud indicators, incomplete documentation, and claimant disputes. Escalates to Claims Manager for high-value or confirmed fraud.

**Approval responsibilities:** None at financial level. Approves claims for progression to assessment (triage approval).

**Governance responsibilities:** Ensures all submitted claims are correctly categorised and documented before entering the assessment pipeline. Maintains data quality at intake.

**The 10 questions this role must answer within 10 seconds:**

1. How many claims are in my intake queue right now?
2. Which claims in my queue are approaching their SLA deadline?
3. Are there any claims with missing documentation that I need to action?
4. Which claims have been flagged with early fraud indicators?
5. What is my current throughput today versus my target?
6. How many claims have I sent back for rework, and why?
7. Are there any claims that have been in my queue for more than 24 hours without action?
8. Which claims are high-value and require priority processing?
9. What is the average time I am spending per claim today?
10. Are there any claimant queries or disputes waiting for my response?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Intake queue management | Fully | Multiple queue tabs; `byStatus` queries |
| Documentation review | Fully | Claim detail view with document checklist |
| Fraud indicator escalation | Partially | `escalateClaim` mutation; no early-indicator surfacing on queue row |
| Priority tier assignment | Partially | High-value threshold filter; no manual priority assignment |
| Assessor assignment | Not At All | No assessor assignment action from dashboard |
| Throughput monitoring | Partially | KPI strip; no daily target comparison |
| Rework tracking | Partially | Send-back action exists; no rework rate KPI |
| SLA monitoring | **Not At All** | No SLA deadline chips on any claim row |
| Claimant query handling | Partially | Notification tab; not integrated with claim row |
| Data quality enforcement | Partially | Document checklist in claim detail; not surfaced on queue row |

**Phase 1 Score: 5.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Intake queue count | Supported | KPI strip |
| Q2: SLA deadline approaching | **Unsupported** | No SLA chips anywhere |
| Q3: Missing documentation | Partially | In claim detail; not on queue row |
| Q4: Early fraud indicators | Partially | `fraudRiskScore` on claim row; no dedicated flag |
| Q5: Throughput vs target | **Unsupported** | No daily target or throughput comparison |
| Q6: Send-back count and reasons | **Unsupported** | No rework rate KPI or send-back log |
| Q7: Claims stalled 24h+ | **Unsupported** | No stalled claim detection |
| Q8: High-value claims | Partially | High-value filter exists; not on landing |
| Q9: Average time per claim | **Unsupported** | No time-per-claim metric |
| Q10: Claimant queries | Partially | Notification tab; not integrated |

**Operational Awareness Score: 3.5/10**  
Six of ten questions are unsupported or only partially supported. This is the lowest Operational Awareness Score across the platform.

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Information Dashboard (should be Operational Dashboard)**

The Claims Processor portal has the data of an Operational Dashboard but is structured as an Information Dashboard — it presents status information without organising it around the processor's decision flow. The processor's primary decision (what to do with the next claim in my queue) is not answered on the landing view.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Intake processing | Yes | Yes | Yes | Yes | Yes |
| Documentation verification | Partially | Yes | Yes | Yes | Yes |
| Fraud escalation | Partially | Yes | Yes | Yes | Yes |
| Priority assignment | Partially | No | N/A | N/A | N/A |
| Assessor assignment | **No** | **No** | N/A | N/A | N/A |
| Send-back / rework | Partially | Yes | N/A | Yes | Yes |
| Claimant communication | Partially | Yes | N/A | Yes | Yes |

**Workflow Governance Score: 5.5/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Queue counts | Yes | KPI strip |
| Queue age | **No** | No oldest-claim or average-age indicator |
| SLA breach visibility | **No** | Absent — platform's worst dimension |
| Bottleneck detection | **No** | No stage-level indicator |
| Per-user workload | **No** | No self-workload view |
| Rework tracking | **No** | No send-back rate KPI |
| Stalled claim detection | **No** | No 24h+ stall indicator |

**Operational Queue Maturity Score: 3.0/10**  
The Claims Processor portal has the lowest Queue Maturity score on the platform. This is the role that most needs SLA visibility — they are the first human in the pipeline and the primary driver of SLA compliance.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip | Situational awareness | None | N/A | Click-through to queue |
| Intake queue tab | Process next claim | View / Approve / Reject | Yes | SLA chip; missing docs flag |
| Financial decision queue | Financial review | Approve / Reject | Yes (`financialApproval`) | — |
| Escalations tab | Escalation review | View | Yes | Escalate action from row |
| Active claims tab | Monitor progress | View | Yes | Stalled flag |
| Risk analytics tab | Fraud review | View | Yes | Escalate from row |

---

### Phase 7 — Reports & Intelligence Review

The Claims Processor portal has a Reports tab with standard reports. The gap is that throughput and rework reports are not surfaced at the section level — a processor cannot see their own performance trend without navigating to the Reports tab.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Status | Evidence |
|---|---|---|
| Fraud risk scoring | AI Used | `fraudRiskScore` on claim rows |
| Damage assessment trigger | AI Available | `AiAssessButton` in claim rows |
| Cost estimation | AI Available | `estimatedCost` from AI pipeline |
| Missing document detection | AI Not Surfaced | No AI-assisted document completeness check |
| Priority classification | AI Not Surfaced | No AI-assisted priority assignment |

**AI Utilisation Score: 5.0/10**

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Claims Processor | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent |
| KPI design | Multi-stat strip | Consistent with Claims Manager |
| Tab bar | shadcn Tabs | Consistent with Executive; inconsistent with Claims Manager custom tabs |
| Alert design | No persistent alerts | Claims Manager has `AttentionRequiredPanel` |
| Queue pattern | Tab-based | Consistent with Claims Manager |

---

### Portal 3 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No SLA deadline chips on claim rows** — supports Q2. This is the most critical gap for the role that drives SLA compliance. Fix: `SLADeadlineChip` on every claim row.
2. **No stalled claim detection** — supports Q7. Fix: add 24h+ stall indicator to intake queue rows.
3. **No throughput vs target KPI** — supports Q5. Fix: add daily throughput counter with target comparison to KPI strip.
4. **No rework rate KPI** — supports Q6. Fix: add send-back count to KPI strip.
5. **No assessor assignment action** — supports daily decision. Fix: add assessor assignment dropdown to claim row actions.

---

## PORTAL 4 — RISK MANAGER

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Risk Manager is the portfolio risk authority. Their decisions concern the risk profile of the claims portfolio, the performance of fraud detection, and the identification of systemic risk patterns that require policy or operational intervention.

**Daily decisions:** The Risk Manager monitors the fraud risk score distribution across the active portfolio. They decide whether any claim or cluster of claims represents an elevated risk requiring immediate escalation. They review AI assessment confidence scores and decide whether low-confidence assessments require manual review.

**Weekly decisions:** The Risk Manager reviews fraud rate trends, repair shop risk profiles, and geographic risk concentrations. They decide whether any pattern indicates organised fraud or systemic abuse. They review the false positive rate on fraud flags and decide whether detection thresholds need adjustment.

**Monthly decisions:** The Risk Manager produces or reviews the portfolio risk report. They decide whether the risk exposure level requires a policy change or underwriting adjustment. They review the AI model's performance against actual fraud outcomes.

**The 10 questions this role must answer within 10 seconds:**

1. What is the current portfolio fraud rate?
2. How many claims are currently flagged as high fraud risk?
3. What is the total financial exposure from fraud-flagged claims?
4. Are there any repair shops generating disproportionate fraud signals?
5. What is the AI model's average confidence score this week?
6. Are there any geographic clusters of high-risk claims?
7. What is the false positive rate on fraud flags this month?
8. How many claims have been escalated for fraud this week?
9. What is the trend in fraud exposure — increasing or decreasing?
10. Are there any claims with fraud scores above the critical threshold awaiting review?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Portfolio fraud monitoring | Fully | `getRiskPortfolioAnalytics`; fraud rate KPI |
| High-risk claim identification | Fully | `fraudRiskScore` filter; high-risk claim list |
| Fraud exposure monitoring | Fully | Fraud exposure KPI |
| Repair shop risk profiling | Partially | Available in analytics; not surfaced as dedicated view |
| AI performance monitoring | Partially | Confidence score available; no false positive rate |
| Geographic risk analysis | Not At All | No geographic clustering view |
| Threshold adjustment | Not At All | No threshold configuration controls |
| False positive rate | Not At All | No false positive tracking |

**Phase 1 Score: 6.0/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Portfolio fraud rate | Supported | KPI strip |
| Q2: High fraud risk count | Supported | KPI strip |
| Q3: Fraud financial exposure | Supported | KPI strip |
| Q4: Repair shop risk profiles | Partially | In analytics; not on landing |
| Q5: AI confidence score | Partially | Available; not in KPI strip |
| Q6: Geographic clusters | **Unsupported** | No geographic view |
| Q7: False positive rate | **Unsupported** | Not tracked |
| Q8: Fraud escalations this week | Partially | Available in escalation data |
| Q9: Fraud exposure trend | Partially | Trend chart available |
| Q10: Critical threshold claims | Partially | High-risk list available |

**Operational Awareness Score: 6.0/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Operational Dashboard (correctly classified for risk monitoring)**

The Risk Manager portal is correctly structured as an Operational Dashboard for risk monitoring. The KPI strip surfaces the three most important risk metrics immediately. The tab structure (Overview, Fraud Intelligence, Claims Analysis, Reports) is logically ordered.

The primary gap is the absence of geographic risk analysis and false positive rate tracking — two capabilities that a Risk Manager needs for weekly and monthly decisions.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Fraud flag review | Yes | Partially | Yes | Yes | Yes |
| High-risk claim escalation | Yes | Yes | Yes (`escalateClaim`) | Yes | Yes |
| AI assessment review | Partially | No | N/A | N/A | N/A |
| Threshold adjustment | **No** | **No** | N/A | N/A | N/A |
| Repair shop risk action | Partially | No | N/A | N/A | N/A |

**Workflow Governance Score: 6.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Fraud queue count | Yes | KPI strip |
| SLA breach visibility | **No** | Absent |
| Fraud exposure trend | Yes | Trend chart |
| AI confidence distribution | Partial | Score available; no distribution |
| False positive tracking | **No** | Not implemented |

**Operational Queue Maturity Score: 5.5/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip (fraud metrics) | Risk awareness | None | N/A | Click-through to fraud queue |
| Fraud Intelligence tab | Fraud review | View + escalate | Yes | Batch escalation |
| Claims Analysis tab | Risk analysis | View | Yes | Export |
| Reports tab | Portfolio review | Export | Yes | — |

---

### Phase 7 — Reports & Intelligence Review

Reports are appropriately placed at portfolio level. The gap is the absence of a false positive rate report and a repair shop risk profile report.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Status | Evidence |
|---|---|---|
| Fraud risk scoring | AI Used | `fraudRiskScore` throughout |
| Portfolio fraud intelligence | AI Used | `getRiskPortfolioAnalytics` |
| Confidence score monitoring | AI Used | Score available |
| False positive detection | AI Not Surfaced | Not tracked |
| Geographic anomaly detection | AI Not Surfaced | No geographic clustering |
| Repair shop risk profiling | AI Partially Used | Available in analytics |

**AI Utilisation Score: 6.0/10**

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Risk Manager | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent |
| KPI design | 4-metric strip | Claims Manager has 6; Executive has 8 — inconsistent count |
| Tab bar | shadcn Tabs | Consistent with Executive |
| Alert design | No persistent alerts | Claims Manager has `AttentionRequiredPanel` |

---

### Portal 4 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No false positive rate tracking** — supports Q7 (weekly decision). Fix: add false positive rate metric to KPI strip.
2. **No geographic risk clustering** — supports Q6. Fix: add geographic risk map or cluster table to Fraud Intelligence tab.
3. **AI confidence score not in KPI strip** — supports Q5. Fix: add to KPI strip.
4. **No repair shop risk profile view** — supports Q4. Fix: add dedicated repair shop risk table to Fraud Intelligence tab.
5. **No SLA breach visibility** — supports cross-portal consistency. Fix: `SLADeadlineChip` on claim rows.

---

## PORTAL 5 — ADMIN

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Admin role manages the operational configuration of the platform — user accounts, role assignments, system settings, and audit compliance. Their decisions are administrative rather than operational.

**Daily decisions:** The Admin decides whether to approve or reject new user registration requests. They decide whether to activate, deactivate, or modify user accounts. They monitor the audit log for unusual activity.

**Weekly decisions:** The Admin reviews user activity and decides whether any account shows signs of misuse. They review system configuration and decide whether any settings require adjustment.

**Monthly decisions:** The Admin produces a user activity report for compliance. They review role assignments and decide whether any user's access level needs adjustment.

**The 10 questions this role must answer within 10 seconds:**

1. How many pending user registration requests are there?
2. Are there any users with unusual activity in the audit log?
3. How many active users are on the platform right now?
4. Are there any system configuration issues requiring attention?
5. Which users have been inactive for more than 30 days?
6. How many role changes were made this week?
7. Are there any failed login attempts that suggest a security concern?
8. What is the current user count by role?
9. Are there any pending approval requests that require my action?
10. What is the audit log status for the current compliance period?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| User registration approval | Partially | User list exists; no pending approval queue |
| User account management | Partially | User list with role badges; no deactivation action |
| Audit log monitoring | Partially | Audit log card in dashboard |
| System configuration | Partially | Quick Actions links to settings |
| Role assignment | Partially | Role visible; no change action from dashboard |
| Inactive user detection | **Not At All** | No inactive user filter |
| Security monitoring | **Not At All** | No failed login tracking |
| Compliance reporting | **Not At All** | No compliance report |

**Phase 1 Score: 4.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Pending registrations | **Unsupported** | No pending registration queue |
| Q2: Unusual audit activity | Partially | Audit log card exists |
| Q3: Active user count | Partially | User count KPI |
| Q4: System config issues | **Unsupported** | No system health indicator |
| Q5: Inactive users | **Unsupported** | No inactive user detection |
| Q6: Role changes this week | **Unsupported** | Not tracked |
| Q7: Failed login attempts | **Unsupported** | Not tracked |
| Q8: User count by role | Partially | Role badges on user list |
| Q9: Pending approvals | **Unsupported** | No approval queue |
| Q10: Audit log compliance status | Partially | Audit log card |

**Operational Awareness Score: 3.0/10**  
Seven of ten questions are unsupported. The Admin portal is the second-lowest scoring portal on Operational Awareness.

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Information Dashboard (should be Management Dashboard)**

The Admin portal presents information about the platform state but does not support the management decisions the Admin role makes. It lacks a pending approval queue, inactive user detection, and security monitoring — the three most important operational capabilities for this role.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| User registration approval | **No** | **No** | N/A | N/A | N/A |
| User deactivation | **No** | **No** | N/A | N/A | N/A |
| Role assignment | Partially | **No** | N/A | N/A | N/A |
| Audit log review | Partially | No | N/A | Yes | Yes |
| System configuration | Partially | Yes (via links) | N/A | N/A | N/A |

**Workflow Governance Score: 3.5/10**  
The Admin portal has the lowest Workflow Governance score on the platform. The core administrative workflows (user approval, deactivation, role change) are not controllable from the dashboard.

---

### Phase 5 — Queue & Workload Intelligence Review

**Operational Queue Maturity Score: 2.0/10**  
No queue management exists in the Admin portal. There is no pending approval queue, no inactive user queue, and no security alert queue.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip | User count awareness | None | N/A | Click-through to user list |
| Quick Actions | Navigation | Navigate | Yes | — |
| Recent Claims Activity | Claims monitoring | Navigate to claim | Yes | — |
| User list | User management | None | N/A | Approve / Deactivate / Change role |
| Audit log | Compliance review | None | N/A | Export |

---

### Phase 7 — Reports & Intelligence Review

No reports are available in the Admin portal. A compliance report and user activity report are required for the monthly decision cycle.

---

### Phase 8 — AI Utilisation Audit

**AI Utilisation Score: 0/10**  
No AI capabilities are surfaced in the Admin portal. This is appropriate for an administrative role.

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Admin | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent |
| KPI design | 4-metric strip | Inconsistent count with other portals |
| Tab bar | shadcn Tabs | Consistent |
| Alert design | No alerts | Inconsistent with Claims Manager |

---

### Portal 5 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No pending user registration queue** — supports Q1 and Q9. Fix: add `PendingRegistrationQueue` component to Admin landing.
2. **No user deactivation or role change action** — supports daily decisions. Fix: add action buttons to user list rows.
3. **No inactive user detection** — supports Q5. Fix: add inactive user filter (no login in 30 days) to user list.
4. **No security monitoring** — supports Q7. Fix: add failed login attempt counter to KPI strip.
5. **No compliance report** — supports monthly decision. Fix: add compliance report export to Reports section.

---

## PORTAL 6 — PANEL BEATER

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Panel Beater (repair shop) manages their job queue, submits quotations, tracks job progress, and communicates with the insurer on approved repairs. Their decisions are operational at the job level.

**Daily decisions:** The Panel Beater decides which jobs in their queue to prioritise. They decide whether to submit a quotation, revise a quotation, or query a quotation rejection. They decide whether a job is ready for final inspection and sign-off.

**Weekly decisions:** The Panel Beater reviews their job completion rate and revenue. They decide whether any pending quotation requires follow-up with the insurer.

**The 10 questions this role must answer within 10 seconds:**

1. How many jobs are in my active queue right now?
2. Which quotations are awaiting insurer approval?
3. Are there any quotations that have been rejected and require revision?
4. Which jobs are approaching their completion deadline?
5. What is my total approved revenue this month?
6. Are there any jobs where the insurer has requested additional information?
7. Which jobs are ready for final inspection?
8. How many jobs have I completed this month?
9. Are there any payment disputes or queries on settled jobs?
10. What is my current approval rate on submitted quotations?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Job queue management | Fully | Job list with status filters |
| Quotation submission | Fully | Quote submission form |
| Quotation revision | Partially | Revision action exists; not surfaced prominently |
| Job progress tracking | Fully | Status badges on job rows |
| Revenue tracking | Partially | Revenue KPI; no monthly breakdown |
| Deadline monitoring | **Not At All** | No deadline chips on job rows |
| Information request handling | Partially | Notification tab |
| Final inspection sign-off | Partially | Action exists in job detail |
| Payment dispute handling | **Not At All** | No dispute workflow |
| Approval rate tracking | **Not At All** | No approval rate KPI |

**Phase 1 Score: 5.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Active job count | Supported | KPI strip |
| Q2: Quotations awaiting approval | Supported | Status filter |
| Q3: Rejected quotations | Partially | Status filter; no prominent alert |
| Q4: Jobs approaching deadline | **Unsupported** | No deadline chips |
| Q5: Approved revenue | Partially | Revenue KPI; no monthly view |
| Q6: Information requests | Partially | Notification tab |
| Q7: Jobs ready for inspection | Partially | Status filter |
| Q8: Completed jobs count | Supported | KPI strip |
| Q9: Payment disputes | **Unsupported** | No dispute workflow |
| Q10: Quotation approval rate | **Unsupported** | Not tracked |

**Operational Awareness Score: 5.0/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Operational Dashboard (correctly classified)**

The Panel Beater portal is correctly structured as an Operational Dashboard for job management. The primary gaps are deadline visibility and approval rate tracking.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Quotation submission | Yes | Yes | Yes | Yes | Yes |
| Quotation approval tracking | Yes | No | N/A | Yes | Yes |
| Job progress updates | Yes | Yes | N/A | Yes | Yes |
| Information request response | Partially | Yes | N/A | Yes | Yes |
| Payment settlement | Partially | No | N/A | Yes | Yes |
| Dispute resolution | **No** | **No** | N/A | N/A | N/A |

**Workflow Governance Score: 6.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Job queue count | Yes | KPI strip |
| Deadline visibility | **No** | No deadline chips |
| Approval rate | **No** | Not tracked |
| Revenue tracking | Partial | KPI; no trend |
| Rework/revision tracking | **No** | Not tracked |

**Operational Queue Maturity Score: 4.0/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip | Job awareness | None | N/A | Click-through |
| Job list | Job management | View / Submit quote | Yes | Deadline chip; revision alert |
| Quotation tab | Quote management | Submit / Revise | Yes | Rejection alert |
| Performance tab | Revenue review | None | N/A | Export |

---

### Phase 7 — Reports & Intelligence Review

No formal reports are available in the Panel Beater portal. A monthly revenue and approval rate report would support the weekly and monthly decision cycle.

---

### Phase 8 — AI Utilisation Audit

**AI Utilisation Score: 2.0/10**  
AI cost estimates are visible on job rows (from the insurer's AI assessment) but no AI capability is available to the Panel Beater directly. This is appropriate — the Panel Beater should not have access to the insurer's fraud scoring.

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Panel Beater | Inconsistency With |
|---|---|---|
| Header pattern | KINGA green card header | Consistent |
| KPI design | 4-metric strip | Inconsistent count |
| Tab bar | shadcn Tabs | Consistent |
| Alert design | No alerts | Inconsistent with Claims Manager |

---

### Portal 6 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No deadline chips on job rows** — supports Q4. Fix: `SLADeadlineChip` on every job row.
2. **No quotation approval rate KPI** — supports Q10. Fix: add approval rate to KPI strip.
3. **No rejected quotation alert** — supports Q3. Fix: add rejected quotation count to KPI strip with alert styling.
4. **No dispute workflow** — supports Q9. Fix: add dispute flag to job rows with escalation path.
5. **No monthly revenue breakdown** — supports Q5. Fix: add monthly revenue chart to Performance tab.

---

## PORTAL 7 — ASSESSOR

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Assessor conducts technical damage assessments on vehicles. Their decisions are technical and time-sensitive — they must assess each claim accurately, within SLA, and with sufficient evidence to support the insurer's approval decision.

**Daily decisions:** The Assessor decides which claims in their queue to assess next (priority order). They decide whether the evidence submitted is sufficient for a complete assessment. They decide the estimated repair cost and whether the damage is consistent with the reported incident. They decide whether to flag a claim for fraud review based on assessment findings. They decide whether to request additional photographs or documentation.

**Weekly decisions:** The Assessor reviews their assessment throughput and accuracy rate. They decide whether any pending assessment is approaching SLA breach.

**The 10 questions this role must answer within 10 seconds:**

1. How many claims are in my assessment queue right now?
2. Which claims are approaching their SLA assessment deadline?
3. Which claims have been assigned to me today?
4. Are there any claims where I have requested additional information and it has now arrived?
5. What is my current assessment throughput this week?
6. Are there any claims I have assessed that have been sent back for revision?
7. Which claims in my queue are high-value and require priority assessment?
8. What is my average assessment time this week?
9. Are there any appointments scheduled for today?
10. What is my fraud flag rate this month?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Assessment queue management | Fully | My Queue tab with assigned claims |
| SLA deadline monitoring | **Not At All** | No SLA chips on queue rows |
| Priority assessment | Partially | High-value flag visible; no priority sort |
| Evidence review | Partially | Document list in claim detail |
| Fraud flagging | Partially | `fraudRiskScore` visible; no flag action from queue |
| Additional info requests | Partially | Action exists in claim detail |
| Throughput monitoring | Partially | Performance tab |
| Send-back tracking | Partially | Performance tab |
| Appointment management | Partially | Appointments tab |
| Fraud flag rate | Partially | Performance tab |

**Phase 1 Score: 6.0/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Assessment queue count | Supported | My Queue tab |
| Q2: SLA approaching | **Unsupported** | No SLA chips |
| Q3: Claims assigned today | Partially | Queue shows all assigned; no "today" filter |
| Q4: Additional info arrived | **Unsupported** | No notification integration with queue |
| Q5: Assessment throughput | Partially | Performance tab |
| Q6: Send-backs | Partially | Performance tab |
| Q7: High-value claims | Partially | Flag visible; not sorted to top |
| Q8: Average assessment time | Partially | Performance tab |
| Q9: Today's appointments | Supported | Appointments tab |
| Q10: Fraud flag rate | Partially | Performance tab |

**Operational Awareness Score: 5.5/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Operational Dashboard (correctly classified)**

The rebuilt Assessor portal is correctly structured as an Operational Dashboard. The three-tab structure (My Queue, Appointments, Performance) maps directly to the assessor's three primary concerns. The primary gap is SLA visibility and the absence of a "new information arrived" notification integrated into the queue.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Assessment queue | Yes | Yes | Yes | Yes | Yes |
| SLA monitoring | **No** | **No** | N/A | N/A | N/A |
| Evidence review | Partially | Yes | N/A | Yes | Yes |
| Fraud flagging | Partially | Partially | Yes | Yes | Yes |
| Additional info request | Partially | Yes | N/A | Yes | Yes |
| Send-back handling | Partially | Yes | N/A | Yes | Yes |
| Appointment management | Yes | Yes | N/A | N/A | N/A |

**Workflow Governance Score: 6.5/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Queue count | Yes | My Queue tab |
| SLA breach visibility | **No** | Absent |
| Priority sorting | Partial | High-value flag; no auto-sort |
| Throughput tracking | Partial | Performance tab |
| Send-back tracking | Partial | Performance tab |
| New info notifications | **No** | Not integrated with queue |

**Operational Queue Maturity Score: 5.0/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| My Queue tab | Next claim decision | View / Assess | Yes | SLA chip; priority sort |
| Appointments tab | Schedule management | View | Yes | Add appointment |
| Performance tab | Self-review | View | Yes | Export |

---

### Phase 7 — Reports & Intelligence Review

No formal reports in the Assessor portal. An assessment accuracy report (AI estimate vs assessor estimate) would support the weekly decision cycle.

---

### Phase 8 — AI Utilisation Audit

| AI Capability | Status | Evidence |
|---|---|---|
| AI damage estimate visible | AI Used | `estimatedCost` on queue rows |
| Fraud risk score visible | AI Used | `fraudRiskScore` on queue rows |
| AI vs assessor comparison | AI Not Surfaced | No comparison view |
| Assessment assistance | AI Not Surfaced | No AI-assisted assessment tool |

**AI Utilisation Score: 4.5/10**

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Assessor | Inconsistency With |
|---|---|---|
| Header pattern | No portal header | Inconsistent with all other portals |
| KPI design | No KPI strip | Inconsistent with all other portals |
| Tab bar | shadcn Tabs | Consistent |
| Alert design | No alerts | Inconsistent |

The Assessor portal, despite its rebuild, does not use the `KingaPortalShell` header or KPI strip. This is the most significant cross-portal inconsistency remaining.

---

### Portal 7 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No SLA deadline chips on queue rows** — supports Q2. Fix: `SLADeadlineChip` on every queue row.
2. **No portal header or KPI strip** — cross-portal consistency. Fix: integrate `KingaPortalShell` header with 4-metric KPI strip (queue count, SLA breaches, throughput this week, avg assessment time).
3. **No "new information arrived" notification in queue** — supports Q4. Fix: add info-arrived badge to claim rows where additional docs have been submitted.
4. **No priority sort on queue** — supports Q7. Fix: add priority sort (high-value first, then SLA proximity).
5. **No AI vs assessor cost comparison** — supports accuracy review. Fix: add AI estimate vs assessor estimate delta to Performance tab.

---

## PORTAL 8 — CLAIMANT

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Claimant is an external user — a policyholder who has submitted or is considering submitting a claim. Their decisions are limited to claim submission, document provision, and follow-up on their claim status.

**Daily decisions:** The Claimant decides whether to submit a new claim, upload additional documents, or query their claim status. They decide whether to accept a settlement offer or dispute it.

**The 10 questions this role must answer within 10 seconds:**

1. What is the current status of my claim?
2. Is there anything I need to provide or do to progress my claim?
3. Has my claim been approved or rejected?
4. What is the approved settlement amount?
5. Are there any messages or queries from the insurer?
6. When was my claim last updated?
7. What documents have I submitted?
8. Is there a next step I need to take?
9. Has my claim been escalated or disputed?
10. How do I submit a new claim?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Claim status tracking | Fully | Status badges on claim list |
| Document submission | Fully | Submit claim form with document upload |
| Settlement review | Partially | Approved amount visible; no formal acceptance action |
| Insurer communication | Partially | Notification system |
| Dispute initiation | **Not At All** | No dispute workflow |
| New claim submission | Fully | Submit claim button |
| Document tracking | Partially | Document list in claim detail |
| Next step guidance | Partially | Status descriptions |

**Phase 1 Score: 6.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Claim status | Supported | Status badges |
| Q2: Action required | Partially | Status descriptions; no explicit action prompt |
| Q3: Approval/rejection | Supported | Status badges |
| Q4: Settlement amount | Supported | Approved amount visible |
| Q5: Insurer messages | Partially | Notification system |
| Q6: Last update | Partially | Timestamp visible |
| Q7: Documents submitted | Partially | In claim detail |
| Q8: Next step | Partially | Status descriptions |
| Q9: Escalation/dispute | **Unsupported** | No dispute workflow |
| Q10: Submit new claim | Supported | Prominent button |

**Operational Awareness Score: 6.5/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Self-Service Portal (correctly classified)**

The Claimant portal is correctly structured as a self-service portal. It is appropriately simple — the claimant does not need a command centre. The primary gaps are the absence of a dispute workflow and clearer next-step guidance.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Claim submission | Yes | Yes | N/A | Yes | Yes |
| Document upload | Yes | Yes | N/A | Yes | Yes |
| Status tracking | Yes | No | N/A | Yes | Yes |
| Settlement acceptance | Partially | **No** | N/A | N/A | N/A |
| Dispute initiation | **No** | **No** | N/A | N/A | N/A |
| Communication | Partially | Yes | N/A | Yes | Yes |

**Workflow Governance Score: 6.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

**Operational Queue Maturity Score: N/A**  
Queue management is not applicable to the Claimant role. The relevant metric is claim progress visibility, which is partially supported.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| Claim list | Status awareness | View claim | Yes | Dispute action |
| KPI strip | Portfolio awareness | None | N/A | — |
| Submit claim button | New claim decision | Navigate | Yes | — |
| Claim detail | Progress review | Upload docs | Yes | Accept settlement |

---

### Portal 8 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No settlement acceptance action** — supports Q3/Q4. Fix: add formal settlement acceptance button to claim detail.
2. **No dispute initiation workflow** — supports Q9. Fix: add dispute initiation action to claim detail.
3. **No explicit next-step prompt** — supports Q2/Q8. Fix: add a "What you need to do next" section to claim detail based on current status.
4. **No document status tracking** — supports Q7. Fix: add document checklist with submission status to claim detail.
5. **No insurer message thread** — supports Q5. Fix: add message thread to claim detail.

---

## PORTAL 9 — FLEET MANAGER

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Fleet Manager manages a company's vehicle fleet and associated claims. Their decisions concern fleet risk management, claim oversight, and vehicle tracking.

**Daily decisions:** The Fleet Manager monitors active claims for their fleet vehicles. They decide whether to escalate a claim or query a decision. They monitor vehicle locations and decide whether any vehicle requires immediate attention.

**Weekly decisions:** The Fleet Manager reviews the fleet's claim frequency and decides whether any vehicle or driver represents elevated risk. They review repair costs and decide whether any repair shop is overcharging.

**The 10 questions this role must answer within 10 seconds:**

1. How many active claims are there for my fleet right now?
2. Which claims are pending approval or decision?
3. Are there any claims that have been rejected or disputed?
4. What is the total claim cost for my fleet this month?
5. Which vehicles have the highest claim frequency?
6. Are there any vehicles currently at a repair shop?
7. What is the average repair cost per claim for my fleet?
8. Are there any claims approaching their resolution deadline?
9. Which drivers have the most claims?
10. What is my fleet's overall risk score?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Fleet claim monitoring | Fully | Claims tab with fleet claims |
| Vehicle tracking | Partially | Vehicle Tracking tab (placeholder) |
| Risk analytics | Partially | Risk Analytics tab (placeholder) |
| Claim escalation | **Not At All** | No escalation action from fleet portal |
| Repair cost monitoring | Partially | Cost visible on claim rows |
| Driver risk profiling | **Not At All** | No driver risk view |
| Deadline monitoring | **Not At All** | No deadline chips |
| Repair shop monitoring | **Not At All** | No repair shop view |

**Phase 1 Score: 4.0/10**  
Two of the three main tabs (Vehicle Tracking, Risk Analytics) are placeholders with no content. This significantly limits the portal's utility.

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Active fleet claims | Supported | Claims tab |
| Q2: Claims pending approval | Partially | Status filter |
| Q3: Rejected/disputed claims | Partially | Status filter |
| Q4: Total claim cost | Partially | Visible on rows; no aggregate |
| Q5: High-frequency vehicles | **Unsupported** | No vehicle frequency view |
| Q6: Vehicles at repair shop | **Unsupported** | Vehicle Tracking tab is placeholder |
| Q7: Average repair cost | **Unsupported** | No aggregate metric |
| Q8: Claims approaching deadline | **Unsupported** | No deadline chips |
| Q9: Driver claim frequency | **Unsupported** | No driver view |
| Q10: Fleet risk score | **Unsupported** | Risk Analytics tab is placeholder |

**Operational Awareness Score: 3.0/10**  
Six questions are unsupported, primarily because two of the three main tabs are placeholders.

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Information Dashboard (should be Operational Dashboard)**

The Fleet Manager portal is currently an Information Dashboard — it shows claim status information but does not support the fleet management decisions the role requires. The Vehicle Tracking and Risk Analytics tabs are placeholders.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Fleet claim monitoring | Yes | No | **No** | Yes | Yes |
| Vehicle tracking | **No** | **No** | N/A | N/A | N/A |
| Risk analytics | **No** | **No** | N/A | N/A | N/A |
| Claim escalation | **No** | **No** | N/A | N/A | N/A |
| Repair cost review | Partially | No | N/A | N/A | N/A |

**Workflow Governance Score: 3.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

**Operational Queue Maturity Score: 2.5/10**  
No queue management, no deadline visibility, no SLA chips. The Fleet Manager portal has the second-lowest Queue Maturity score.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| Claims tab | Claim monitoring | View claim | Yes | Escalate; deadline chip |
| Vehicle Tracking tab | Vehicle monitoring | None (placeholder) | N/A | Full implementation needed |
| Risk Analytics tab | Risk review | None (placeholder) | N/A | Full implementation needed |

---

### Portal 9 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **Vehicle Tracking tab is a placeholder** — supports Q5/Q6. This is the most critical gap — the Fleet Manager cannot perform their primary function without vehicle tracking.
2. **Risk Analytics tab is a placeholder** — supports Q10. Fix: implement fleet risk analytics with vehicle frequency and driver risk views.
3. **No deadline chips on claim rows** — supports Q8. Fix: `SLADeadlineChip` on every claim row.
4. **No escalation action from fleet portal** — supports Q2/Q3. Fix: add escalation action to claim rows.
5. **No aggregate fleet cost metric** — supports Q4/Q7. Fix: add total fleet cost and average cost per claim to KPI strip.

---

## PORTAL 10 — RECOVERY

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Recovery role manages third-party liability recovery — pursuing reimbursement from at-fault third parties after the insurer has settled a claim. Their decisions concern case prioritisation, recovery strategy, and deadline management.

**Daily decisions:** The Recovery officer decides which cases to pursue actively, which to escalate to legal, and which are approaching their recovery deadline. They decide whether a settlement offer from a third party is acceptable.

**Weekly decisions:** The Recovery officer reviews the recovery rate and decides whether any case requires a change in strategy. They review the portfolio for cases approaching statutory limitation periods.

**The 10 questions this role must answer within 10 seconds:**

1. How many active recovery cases are there?
2. Which cases are approaching their recovery deadline?
3. What is the total outstanding recovery amount?
4. Which cases have received a settlement offer from the third party?
5. What is the current recovery rate (amount recovered vs amount claimed)?
6. Which cases have been open for more than 90 days without progress?
7. Are there any cases that require legal escalation?
8. What is the average recovery amount per settled case?
9. Which cases are in the "repeat offender" category?
10. What is the total amount recovered this month?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Case queue management | Fully | Queue card system with status filters |
| Deadline monitoring | Partially | `deadlineChip` function exists; applied to case rows |
| Recovery rate monitoring | Fully | `getInsurerIntelligence` query; recovery rate KPI |
| Settlement offer handling | **Not At All** | No settlement offer workflow |
| Legal escalation | **Not At All** | No legal escalation action |
| Repeat offender tracking | Fully | Repeat offender toggle filter |
| Stalled case detection | Partially | No 90-day stall indicator |
| Portfolio intelligence | Fully | `RecoveryIntelligence` component |

**Phase 1 Score: 6.5/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Active case count | Supported | Queue cards |
| Q2: Cases approaching deadline | Supported | `deadlineChip` on case rows; warning banner |
| Q3: Outstanding recovery amount | Supported | `RecoveryIntelligence` |
| Q4: Settlement offers received | **Unsupported** | No settlement offer workflow |
| Q5: Recovery rate | Supported | `RecoveryIntelligence` |
| Q6: Cases stalled 90 days | **Unsupported** | No stall detection |
| Q7: Legal escalation needed | **Unsupported** | No legal escalation workflow |
| Q8: Average recovery amount | Supported | `RecoveryIntelligence` |
| Q9: Repeat offenders | Supported | Repeat offender filter |
| Q10: Amount recovered this month | Supported | `RecoveryIntelligence` |

**Operational Awareness Score: 7.0/10**  
The Recovery portal has the highest Operational Awareness Score on the platform. The `deadlineChip` implementation is the only example of SLA/deadline visibility anywhere on the platform and should be the model for the shared `SLADeadlineChip` component.

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Operational Dashboard (correctly classified)**

The Recovery portal is the best-structured operational portal on the platform. The queue card system (click to filter by status) is an effective pattern that other portals should adopt. The `RecoveryIntelligence` section provides portfolio-level context without requiring navigation.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Case queue management | Yes | Yes | N/A | Yes | Yes |
| Deadline monitoring | Yes | No | N/A | Yes | Yes |
| Recovery intelligence | Yes | No | N/A | Yes | Yes |
| Settlement offer handling | **No** | **No** | N/A | N/A | N/A |
| Legal escalation | **No** | **No** | N/A | N/A | N/A |
| Repeat offender tracking | Yes | Yes (filter) | N/A | Yes | Yes |

**Workflow Governance Score: 7.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Queue counts | Yes | Queue cards |
| Deadline visibility | Yes | `deadlineChip` — best implementation on platform |
| Recovery rate | Yes | `RecoveryIntelligence` |
| Stalled case detection | **No** | No 90-day stall indicator |
| Settlement offer tracking | **No** | Not implemented |

**Operational Queue Maturity Score: 7.5/10**  
The Recovery portal has the highest Queue Maturity score on the platform, primarily due to the `deadlineChip` implementation.

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| Queue cards | Case prioritisation | Filter by status | Yes | — |
| Case list | Case management | View case | Yes | Settlement offer; legal escalation |
| Deadline chip | Deadline awareness | Visual indicator | Yes | Escalate action on breach |
| Repeat offender toggle | Risk prioritisation | Filter | Yes | — |
| Recovery Intelligence | Portfolio review | None | N/A | Export |

---

### Phase 7 — Reports & Intelligence Review

The `RecoveryIntelligence` component provides appropriate portfolio-level intelligence. The gap is the absence of a monthly recovery report export.

---

### Phase 8 — AI Utilisation Audit

**AI Utilisation Score: 1.0/10**  
No AI capabilities are surfaced in the Recovery portal. AI-assisted recovery probability scoring (likelihood of successful recovery based on case characteristics) would be a high-value addition.

---

### Phase 9 — Cross-Portal Governance Review

| Dimension | Recovery | Inconsistency With |
|---|---|---|
| Header pattern | No portal header | Inconsistent with Claims Manager, Executive, Processor |
| KPI design | No KPI strip | Inconsistent |
| Queue pattern | Card-based queue | Claims Manager uses tab-based queue — inconsistent |
| Deadline chip | `deadlineChip` function | Should be shared `SLADeadlineChip` component |

The Recovery portal's `deadlineChip` is a local function, not a shared component. It should be extracted into the shared `SLADeadlineChip` component and applied platform-wide.

---

### Portal 10 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No settlement offer workflow** — supports Q4. Fix: add settlement offer receipt and acceptance/rejection action to case rows.
2. **No legal escalation workflow** — supports Q7. Fix: add legal escalation action to case rows with escalation reason selection.
3. **No stalled case detection** — supports Q6. Fix: add 90-day stall indicator to case rows.
4. **No portal header or KPI strip** — cross-portal consistency. Fix: integrate `KingaPortalShell` header.
5. **`deadlineChip` is a local function** — should be extracted as shared `SLADeadlineChip` component.

---

## PORTAL 11 — INSURER ADMIN

### Phase 0 — Role & Decision Inventory (Independent of Existing UI)

The Insurer Admin manages the insurer's operational configuration — team members, tier settings, fraud analytics oversight, and platform-wide settings. Their decisions are administrative and strategic at the insurer level.

**Daily decisions:** The Insurer Admin monitors the claims pipeline for their insurer. They decide whether any operational metric requires escalation to the Claims Manager. They manage team member access and roles.

**Weekly decisions:** The Insurer Admin reviews fraud analytics and decides whether detection thresholds need adjustment. They review the platform's tier feature usage and decide whether to upgrade.

**The 10 questions this role must answer within 10 seconds:**

1. How many active claims are in the pipeline for my insurer?
2. What is the current fraud detection rate?
3. Are there any fraud-flagged claims awaiting review?
4. How many team members are active on the platform?
5. What is the total claims value in the pipeline?
6. Are there any system alerts or configuration issues?
7. What is the current tier and which features are available?
8. How many claims have been processed this month?
9. What is the average processing time for my insurer's claims?
10. Are there any pending team member requests?

---

### Phase 1 — Role Definition Validation

| Responsibility | Support Level | Evidence |
|---|---|---|
| Claims pipeline monitoring | Fully | KPI strip; recent claims activity |
| Fraud monitoring | Fully | Fraud detected KPI; fraud analytics link |
| Team member management | Partially | Team member list; no approval queue |
| Tier management | Partially | Quick Actions link |
| System configuration | Partially | Quick Actions links |
| Audit log review | Partially | Audit log card |
| Performance monitoring | Partially | KPI strip |
| Pending team requests | **Not At All** | No pending request queue |

**Phase 1 Score: 6.0/10**

---

### Phase 2 — Operational Question Assessment

| Question | Support | Evidence |
|---|---|---|
| Q1: Active claims count | Supported | KPI strip |
| Q2: Fraud detection rate | Supported | KPI strip |
| Q3: Fraud-flagged claims | Partially | KPI; no dedicated queue |
| Q4: Active team members | Supported | KPI strip |
| Q5: Total claims value | Supported | KPI strip |
| Q6: System alerts | **Unsupported** | No system health indicator |
| Q7: Current tier and features | Partially | Quick Actions link |
| Q8: Claims processed this month | Partially | KPI; no monthly breakdown |
| Q9: Average processing time | Supported | KPI strip |
| Q10: Pending team requests | **Unsupported** | No pending request queue |

**Operational Awareness Score: 6.5/10**

---

### Phase 3 — Dashboard Architecture Classification

**Classification: Management Dashboard (correctly classified)**

The Insurer Admin portal is correctly structured as a Management Dashboard — it provides portfolio-level oversight without exposing operational workflow controls. The primary gaps are system health monitoring and pending team request management.

---

### Phase 4 — Workflow Alignment Review

| Workflow | Visible | Controllable | Escalation Path | Governance | Auditability |
|---|---|---|---|---|---|
| Claims monitoring | Yes | No | N/A | Yes | Yes |
| Fraud monitoring | Yes | Partially | Yes | Yes | Yes |
| Team management | Partially | Partially | N/A | Yes | Yes |
| System configuration | Partially | Yes (via links) | N/A | N/A | N/A |
| Pending team requests | **No** | **No** | N/A | N/A | N/A |

**Workflow Governance Score: 6.0/10**

---

### Phase 5 — Queue & Workload Intelligence Review

| Dimension | Present | Notes |
|---|---|---|
| Claims queue count | Yes | KPI strip |
| SLA visibility | **No** | Absent |
| Fraud queue | Partial | KPI; no dedicated queue |
| Team request queue | **No** | Not implemented |

**Operational Queue Maturity Score: 4.5/10**

---

### Phase 6 — Actionability Audit

| Widget | Decision Supported | Action Available | Routing Correct | Missing Action |
|---|---|---|---|---|
| KPI Strip | Portfolio awareness | None | N/A | Click-through to queues |
| Quick Actions | Navigation | Navigate | Yes | — |
| Recent Claims Activity | Claims monitoring | Navigate to claim | Yes | Fraud escalation from row |
| Team member list | Team management | None | N/A | Approve / Deactivate |
| Audit log | Compliance review | None | N/A | Export |

---

### Portal 11 Summary

**Top 5 Gaps (ranked by decision-impact):**

1. **No pending team request queue** — supports Q10. Fix: add `PendingTeamRequestQueue` component.
2. **No fraud-flagged claim queue** — supports Q3. Fix: add dedicated fraud queue section.
3. **No system health indicator** — supports Q6. Fix: add system health KPI to strip.
4. **No SLA visibility** — supports cross-portal consistency. Fix: SLA compliance rate in KPI strip.
5. **No team member action buttons** — supports daily decisions. Fix: add approve/deactivate to team member rows.

---

---

## PHASE 10 — PLATFORM-WIDE SYNTHESIS

### Decision-Alignment Scores by Portal

| Portal | Phase 1 (Role) | Phase 2 (Awareness) | Phase 4 (Workflow) | Phase 5 (Queue) | Phase 6 (Action) | Phase 8 (AI) | **Decision-Alignment Score** |
|---|---|---|---|---|---|---|---|
| Claims Manager | 6.5 | 5.5 | 7.0 | 4.5 | 7.0 | 6.5 | **6.2** |
| Executive | 6.0 | 5.5 | 5.5 | 5.0 | 6.0 | 5.5 | **5.6** |
| Claims Processor | 5.5 | 3.5 | 5.5 | 3.0 | 5.5 | 5.0 | **4.7** |
| Risk Manager | 6.0 | 6.0 | 6.0 | 5.5 | 6.0 | 6.0 | **5.9** |
| Admin | 4.5 | 3.0 | 3.5 | 2.0 | 4.0 | 0.0 | **2.8** |
| Panel Beater | 5.5 | 5.0 | 6.0 | 4.0 | 5.5 | 2.0 | **4.7** |
| Assessor | 6.0 | 5.5 | 6.5 | 5.0 | 6.0 | 4.5 | **5.6** |
| Claimant | 6.5 | 6.5 | 6.0 | N/A | 6.0 | 0.0 | **5.2** |
| Fleet Manager | 4.0 | 3.0 | 3.0 | 2.5 | 3.5 | 0.0 | **2.7** |
| Recovery | 6.5 | 7.0 | 7.0 | 7.5 | 7.0 | 1.0 | **6.0** |
| Insurer Admin | 6.0 | 6.5 | 6.0 | 4.5 | 5.5 | 0.0 | **4.8** |
| **Platform Average** | **5.7** | **5.1** | **5.6** | **4.3** | **5.7** | **2.8** | **4.9** |

**The platform's Decision-Alignment Score is 4.9/10.** This means the average portal answers fewer than half of its role owner's most important operational questions on the landing view. The primary driver of this score is the near-universal absence of SLA deadline visibility (Queue Maturity: 4.3/10) and the widespread gap between what a role owner needs to decide and what the portal surfaces without navigation.

---

### The Five Platform-Wide Gaps (Ranked by Decision-Impact)

**Gap 1 — No SLA Deadline Visibility Anywhere (except Recovery's local function)**

This is the single most impactful gap across the platform. SLA deadline visibility affects the Claims Manager (Q2), Claims Processor (Q2), Assessor (Q2), Panel Beater (Q4), Fleet Manager (Q8), and every other role that manages time-sensitive items. The Recovery portal has a local `deadlineChip` function that proves the concept works — it should be extracted into a shared `SLADeadlineChip` component and applied to every claim, job, case, and assessment row across the platform.

**Gap 2 — No Persistent Critical Attention Zone**

The Claims Manager, Claims Processor, Risk Manager, and Assessor portals all have urgent items (fraud flags, SLA breaches, stalled claims, high-value pending) that are buried inside tabs. A user must navigate to find them. The `AttentionRequiredPanel` component in the Claims Manager portal is the right concept but is placed inside a tab. It should be promoted above the tab bar as a persistent Critical Attention Zone — visible on every landing view, collapsed when empty, expanded when items exist.

**Gap 3 — Two Portals Have Placeholder Tabs (Fleet Manager)**

The Fleet Manager portal's Vehicle Tracking and Risk Analytics tabs are placeholders with no content. This means the Fleet Manager cannot perform two of their three primary functions from the dashboard. These tabs need full implementation before the portal can be considered operational.

**Gap 4 — Admin and Fleet Manager Portals Are Not Decision-Ready**

The Admin portal (2.8/10) and Fleet Manager portal (2.7/10) have Decision-Alignment Scores below 3.0/10 — they are information displays, not operational tools. The Admin portal lacks a pending user registration queue, user deactivation actions, and security monitoring. The Fleet Manager portal lacks vehicle tracking, risk analytics, and escalation actions. Both require substantial rebuilds.

**Gap 5 — No Shared Component Architecture for Cross-Portal Patterns**

The platform has 11 portals implementing the same patterns (queue rows, status badges, deadline indicators, KPI strips) independently. The `KingaPortalShell` component was built but not yet integrated into any portal. The Recovery portal's `deadlineChip` is a local function. The Claims Manager's `AttentionRequiredPanel` is a standalone component. These should be unified into a shared component library:

- `SLADeadlineChip` — extracted from Recovery's `deadlineChip`
- `CriticalAttentionZone` — extracted from Claims Manager's `AttentionRequiredPanel`
- `PortalKPIStrip` — from `KingaPortalShell`
- `PortalHeader` — from `KingaPortalShell`
- `ClaimRowActions` — standardised action set for claim rows

---

### Prioritised Fix List

**Tier 1 — Immediate (0–3 days): Decision-Critical Gaps**

| Fix | Portals Affected | Decision Supported | Effort |
|---|---|---|---|
| Extract `SLADeadlineChip` from Recovery and apply to all claim/job/case rows | All 11 portals | Q2 in every portal | Medium |
| Promote `AttentionRequiredPanel` above tab bar in Claims Manager | Claims Manager | Q2, Q4, Q10 | Low |
| Add fraud-flagged count to Claims Manager KPI strip with click-through | Claims Manager | Q4 | Low |
| Add stalled claim detection (48h no movement) to Claims Manager `AttentionRequiredPanel` | Claims Manager | Q10 | Medium |
| Add SLA compliance rate to Executive KPI strip | Executive | Q8 | Low |
| Add throughput vs target KPI to Claims Processor | Claims Processor | Q5 | Low |
| Add rework rate KPI to Claims Processor | Claims Processor | Q6 | Low |
| Add stalled claim detection (24h) to Claims Processor queue | Claims Processor | Q7 | Medium |
| Add `KingaPortalShell` header and KPI strip to Assessor portal | Assessor | Cross-portal consistency | Low |
| Add `KingaPortalShell` header and KPI strip to Recovery portal | Recovery | Cross-portal consistency | Low |

**Tier 2 — Short-Term (1–2 weeks): Operational Completeness**

| Fix | Portals Affected | Decision Supported | Effort |
|---|---|---|---|
| Add `WorkloadDistributionPanel` to Claims Manager Oversight section | Claims Manager | Q7 | High |
| Add `ExecutiveEscalationQueue` to Executive Overview | Executive | Q10 | High |
| Add assessor assignment action to Claims Processor claim rows | Claims Processor | Daily decision | Medium |
| Add false positive rate KPI to Risk Manager | Risk Manager | Q7 | Medium |
| Add geographic risk clustering to Risk Manager Fraud Intelligence tab | Risk Manager | Q6 | High |
| Add pending user registration queue to Admin portal | Admin | Q1, Q9 | Medium |
| Add user deactivation and role change actions to Admin user list | Admin | Daily decision | Medium |
| Add deadline chips to Panel Beater job rows | Panel Beater | Q4 | Low |
| Add quotation approval rate KPI to Panel Beater | Panel Beater | Q10 | Low |
| Add settlement acceptance action to Claimant claim detail | Claimant | Q3/Q4 | Medium |
| Add dispute initiation workflow to Claimant claim detail | Claimant | Q9 | High |
| Add pending team request queue to Insurer Admin | Insurer Admin | Q10 | Medium |

**Tier 3 — Medium-Term (1–2 months): Platform Maturity**

| Fix | Portals Affected | Decision Supported | Effort |
|---|---|---|---|
| Implement Fleet Manager Vehicle Tracking tab | Fleet Manager | Q5, Q6 | Very High |
| Implement Fleet Manager Risk Analytics tab | Fleet Manager | Q9, Q10 | Very High |
| Add escalation action to Fleet Manager claim rows | Fleet Manager | Q2, Q3 | Medium |
| Add inactive user detection to Admin portal | Admin | Q5 | Medium |
| Add security monitoring (failed logins) to Admin portal | Admin | Q7 | High |
| Add compliance report export to Admin portal | Admin | Monthly decision | Medium |
| Add settlement offer workflow to Recovery portal | Recovery | Q4 | High |
| Add legal escalation workflow to Recovery portal | Recovery | Q7 | High |
| Add stalled case detection (90 days) to Recovery portal | Recovery | Q6 | Medium |
| Add AI vs assessor cost comparison to Assessor Performance tab | Assessor | Accuracy review | Medium |
| Add "new information arrived" badge to Assessor queue rows | Assessor | Q4 | Medium |
| Add repair shop risk profile view to Risk Manager | Risk Manager | Q4 | High |
| Add predictive analytics to Executive portal | Executive | Strategic decisions | Very High |

**Tier 4 — Strategic (3–12 months): Platform Transformation**

| Fix | Decision Supported | Effort |
|---|---|---|
| Unified shared component library (`SLADeadlineChip`, `CriticalAttentionZone`, `PortalKPIStrip`, `ClaimRowActions`) | Platform-wide consistency | High |
| AI recovery probability scoring for Recovery portal | Q4, Q7 | Very High |
| AI-assisted document completeness check for Claims Processor | Q3 | High |
| AI-assisted priority classification for Claims Processor | Q8 | High |
| Predictive SLA breach detection for Claims Manager | Q2 | Very High |
| Geographic fraud clustering for Risk Manager | Q6 | Very High |
| Driver risk profiling for Fleet Manager | Q9 | High |
| Repair shop risk profiling across all portals | Cross-portal | High |

---

### Build Order (Recommended Sprint Structure)

**Sprint 1 — SLA Visibility and Critical Attention Zone (Week 1)**

1. Extract `SLADeadlineChip` from Recovery portal's `deadlineChip` function into `client/src/components/SLADeadlineChip.tsx`
2. Apply `SLADeadlineChip` to claim rows in: Claims Manager (IntakeQueueTab, ReviewQueueTab, ActiveClaimsTab), Claims Processor (all queue tabs), Assessor (My Queue tab), Panel Beater (job rows), Fleet Manager (claim rows)
3. Promote `AttentionRequiredPanel` above tab bar in Claims Manager
4. Add stalled claim detection to `AttentionRequiredPanel`
5. Add fraud-flagged count to Claims Manager KPI strip
6. Add `KingaPortalShell` header and KPI strip to Assessor and Recovery portals

**Sprint 2 — Operational Completeness (Week 2)**

1. Add `WorkloadDistributionPanel` to Claims Manager
2. Add `ExecutiveEscalationQueue` to Executive Dashboard
3. Add throughput vs target and rework rate KPIs to Claims Processor
4. Add assessor assignment action to Claims Processor claim rows
5. Add pending user registration queue to Admin portal
6. Add user deactivation and role change actions to Admin user list
7. Add quotation approval rate and deadline chips to Panel Beater
8. Add settlement acceptance and dispute initiation to Claimant portal
9. Add pending team request queue to Insurer Admin

**Sprint 3 — Fleet Manager and Recovery Completion (Weeks 3–4)**

1. Implement Fleet Manager Vehicle Tracking tab (map view with vehicle locations)
2. Implement Fleet Manager Risk Analytics tab (vehicle frequency, driver risk)
3. Add escalation action to Fleet Manager claim rows
4. Add settlement offer workflow to Recovery portal
5. Add legal escalation workflow to Recovery portal
6. Add stalled case detection to Recovery portal

**Sprint 4 — Shared Component Library (Month 2)**

1. Extract all shared patterns into `client/src/components/portal/` directory
2. Refactor all portals to use shared components
3. Apply `KingaPortalShell` to all 11 portals
4. Standardise KPI strip count (6 metrics) across all portals
5. Standardise tab bar component (single implementation) across all portals

---

### Shared Component Plan

The following components should be built as shared, reusable components in `client/src/components/portal/`:

| Component | Source | Used By | Props |
|---|---|---|---|
| `SLADeadlineChip` | Recovery `deadlineChip` | All portals | `deadline: Date`, `status: 'ok' \| 'warning' \| 'breach'` |
| `CriticalAttentionZone` | Claims Manager `AttentionRequiredPanel` | Claims Manager, Processor, Assessor | `items: AttentionItem[]`, `onAction: (id) => void` |
| `PortalHeader` | `KingaPortalShell` | All portals | `title`, `subtitle`, `icon`, `badge`, `actions` |
| `PortalKPIStrip` | `KingaPortalShell` | All portals | `metrics: KPIMetric[]` (max 6) |
| `ClaimRowActions` | Various | Claims Manager, Processor, Assessor | `claimId`, `availableActions`, `onAction` |
| `WorkloadDistributionPanel` | New | Claims Manager | `users: UserWorkload[]` |
| `StallIndicator` | New | Claims Manager, Processor | `lastActivity: Date`, `threshold: number` |

---

## PHASE 11 — CRAFT PUNCH-LIST

**This phase is applied only after all Phase 10 Tier 1 and Tier 2 fixes are implemented and verified. Do not apply craft changes to portals with Decision-Alignment Scores below 5.0/10 — fix the hierarchy first.**

### Typography Consistency

| Issue | Portals | Fix |
|---|---|---|
| KPI number font size varies (text-2xl vs text-3xl vs text-4xl) | All | Standardise to `text-3xl font-bold` for primary KPIs, `text-xl font-semibold` for secondary |
| Section header weight inconsistency | Claims Manager, Executive | Standardise to `text-xs uppercase font-semibold tracking-wider text-muted-foreground` |
| Card title size varies | All | Standardise to `text-base font-semibold` for card titles |
| Tab label size varies | Claims Manager, Executive | Standardise to `text-sm font-medium` |

### Spacing Consistency

| Issue | Portals | Fix |
|---|---|---|
| Card padding varies (p-4 vs p-6) | All | Standardise to `p-6` for content cards, `p-4` for compact cards |
| Section gap varies (gap-4 vs gap-6 vs gap-8) | All | Standardise to `gap-6` between sections, `gap-4` within sections |
| KPI strip column gap inconsistent | Claims Manager, Executive | Standardise to `gap-x-6` with `1px solid var(--border)` dividers |

### Icon Consistency

| Issue | Portals | Fix |
|---|---|---|
| Icon size varies (h-4 w-4 vs h-5 w-5 vs h-6 w-6) | All | Standardise to `h-4 w-4` for inline icons, `h-5 w-5` for card icons, `h-6 w-6` for KPI icons |
| Icon container size varies | All | Standardise to `h-10 w-10 rounded-lg` for KPI icon containers |
| Icon colour inconsistent | All | Use brand hex values via inline style — no Tailwind colour classes |

### Status Badge Consistency

| Issue | Portals | Fix |
|---|---|---|
| Badge size varies | All | Standardise to `text-xs font-medium px-2 py-0.5 rounded-full` |
| Badge colour mapping inconsistent | All | Standardise: Pending=`#E8F4F0/#3C7844`, Active=`#EBF4FF/#4878A8`, Fraud=`#FEF2F2/#A32D2D`, Warning=`#FFFBEB/#8A5C00` |
| Badge border varies | All | Remove all badge borders — background colour is sufficient |

### Empty State Consistency

| Issue | Portals | Fix |
|---|---|---|
| Empty state messages vary in tone | All | Standardise to: icon (muted) + title ("No [items] yet") + description (one sentence) |
| Empty state icon colour varies | All | Standardise to `text-muted-foreground` |
| Empty state padding varies | All | Standardise to `py-12 text-center` |

---

## Appendix A — Platform Certification Checklist v1.0

Each portal must pass 9 of the following 12 criteria to achieve KINGA Platform Certification:

| # | Criterion | Verification Method |
|---|---|---|
| 1 | Portal uses `KingaPortalShell` header with KINGA forest green icon container | Visual inspection |
| 2 | KPI strip present with 4–6 metrics, all using brand hex values | Visual inspection |
| 3 | No Tailwind foreign colour classes (`emerald`, `teal`, `blue`, `amber`, `purple`, `indigo`) in header, KPI strip, or tab bar | Code grep |
| 4 | `SLADeadlineChip` applied to all claim/job/case rows | Code inspection |
| 5 | Tab bar uses single consistent implementation (shadcn `Tabs` or custom with ARIA attributes) | Code inspection |
| 6 | All 10 Phase 0 operational questions answered within 10 seconds of landing | User test |
| 7 | Critical Attention Zone visible on landing (collapsed when empty) | Visual inspection |
| 8 | All action buttons route to the correct procedure (`trpc.*`) | Code inspection |
| 9 | Empty states present on all queue and list components | Visual inspection |
| 10 | Loading states present on all data-fetching components | Code inspection |
| 11 | No hardcoded mock data — all data from tRPC queries | Code inspection |
| 12 | TypeScript errors in portal file: 0 | `tsc --noEmit` |

**Certification Threshold: 9/12 (75%)**  
Portals below threshold are classified "Not Certified" and must not be presented to external stakeholders.

---

## Appendix B — Current Certification Status

| Portal | Criteria Met | Status |
|---|---|---|
| Claims Manager | 7/12 | Not Certified (SLA chips, stalled detection, workload panel missing) |
| Executive | 7/12 | Not Certified (SLA metric, escalation queue, bottleneck indicator missing) |
| Claims Processor | 5/12 | Not Certified |
| Risk Manager | 8/12 | Not Certified (SLA chips, false positive rate missing) |
| Admin | 4/12 | Not Certified |
| Panel Beater | 6/12 | Not Certified |
| Assessor | 6/12 | Not Certified (no header/KPI strip, no SLA chips) |
| Claimant | 7/12 | Not Certified (settlement acceptance, dispute workflow missing) |
| Fleet Manager | 3/12 | Not Certified (placeholder tabs, no escalation) |
| Recovery | 8/12 | Not Certified (no header/KPI strip, no settlement workflow) |
| Insurer Admin | 7/12 | Not Certified (pending request queue, team actions missing) |

**No portal currently meets the 9/12 certification threshold.** Sprint 1 and Sprint 2 implementation would bring Claims Manager, Risk Manager, Recovery, and Assessor to certification.

---

*Document ends. Version 2.0. Next review: after Sprint 2 completion.*
