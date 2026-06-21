# KINGA Platform — Active Todo List
# Audited: June 2026 | Replaced 12,469-line accumulation with clean active list

---

## Codebase Maintainability — Phase 1 (Active)

- [x] Write developer README.md — quick start, pipeline overview, table map, code standards, key decisions
- [x] Remove @ts-nocheck from server/db.ts
- [x] Remove @ts-nocheck from server/routers.ts
- [x] Wire upsertVehicleRegistry into post-pipeline flow (fire-and-forget, non-blocking)
- [x] Wire runCrossClaimIntelligence into post-pipeline flow (3s delay, non-blocking)
- [x] Fix persistExtractedQuote.ts: li.unitCost → li.unitPrice (silent bug — line-item sum always returned 0)
- [ ] Remove @ts-nocheck from remaining server files — prioritise server/routers/ and server/services/ first (~40 high-value files out of 161 total)
- [ ] Add per-field confidence scores to extracted quote fields
- [ ] Add OCR quality pre-assessment step before Stage 3 extraction (reject low-quality scans before LLM call)
- [ ] Build human-correction feedback loop for adjuster overrides (store adjuster corrections → feed back into extraction training data)

---

## Part Normalisation — Phase A (Completed June 2026)

- [x] Fix 1: normalise() in quoteOptimisationEngine now calls resolveToCanonical() as single source of truth
- [x] Fix 2: ASSEMBLY_CONTAINS map — deferred; current matching is sufficient for Phase A
- [x] Fix 3: canonicalPartId stored in QuoteLineItem output from quoteExtractionEngine

## Part Normalisation — Phase B (Next Sprint)

- [ ] Add ASSEMBLY_CONTAINS map to canonicalPartsVocabulary.ts for assembly-aware matching (e.g. "front bumper assembly" → bumper + grille + fog light)
- [ ] Add per-line-item confidence score to QuoteLineItem (extraction confidence, not just canonical match)
- [ ] Wire canonicalPartId into the quote optimisation scoring engine (currently stored but not consumed)

---

## Police Report Pipeline (Completed June 2026)

- [x] Fix A: Stage-3 extraction — CRITICAL POLICE REASONING RULES block added (normalise chargedParty, map status to enum, strip boilerplate from officerFindings)
- [x] Fix B: Stage-7b causal reasoning — police evidence block added to prompt; wrongedParty now informed by police charge
- [x] Fix C: Demand letter generator — enriched police fields (chargedParty, officerFindings, investigationStatus) now included in letter context
- [x] Fix D: Recovery trigger RPS scoring — policeChargedThirdParty and policeInvestigationActive now boost RPS score

---

## ForensicAuditReport — Fix Plan (Completed June 2026)

### Data Integrity
- [x] FAR-1: Police report data path unified — claimRecord0?.policeReport?.reportNumber is primary, aiAssessment?.policeReportNumber is fallback
- [x] FAR-2: Photo fallback from claimDocuments table — if bridge.photoUrls and damagePhotosJson are both empty, FAR query now reads damage_photo entries from claimDocuments
- [x] FAR-3: KINGA Estimate row — green left border (4px solid #15803d) added to visually distinguish it from submitted quote rows
- [x] FAR-4: "0 pts" → "Not triggered" with muted italic style and tooltip

### P1 Layout
- [x] FAR-P1-1: Vehicle Damage Map — full-width, centred, maxWidth 320px (confirmed in code)
- [x] FAR-P1-2: Decision Flowchart — nodeW=130, diamondW=120 (applied)
- [x] FAR-P1-3: Quote Reconciliation — redesigned from pill tags to 3-column discrepancy table
- [x] FAR-P1-4: Section 9 pending state — compact horizontal strip with lock icon

### P2 Layout
- [x] FAR-P2-1: Analysis Methods filter — "Corroborates speed range" rows hidden; only numeric results + outliers shown
- [x] FAR-P2-2: Quality Score table — maxWidth: 480 applied
- [x] FAR-P2-3: Validation grid padding — reduced to 2px 5px
- [x] FAR-P2-4: Confidence Meter — 3-bar strip (FCDI / Data Completeness / Physics) added to Section 0

### Structural
- [x] FAR-S1: Glossary column widths — Term: 55px, Full Name: maxWidth 180px, Definition: fills remainder
- [x] FAR-S2: Legacy formula names retired — M1–M5 now use KINGA-branded names throughout
- [x] FAR-S3: White gap elimination — section-heading and sub-heading margins reduced

---

## AI → KINGA Rebranding (Completed June 2026)

- [x] Replace all user-facing "AI" labels with KINGA branding — 216 replacements across 70 client + server files
- [x] Preserve internal variable names (aiAssessment, aiVision) and third-party references (OpenAI)

---

## Intelligence Registry — Phase 1 (Next Sprint)

- [ ] Build repairerIntelligence table: repairer_id, risk_tier (A/B/C/D), total_claims, avg_deviation_pct, fraud_flags, last_updated
- [ ] Build entityLinks table: entity_type (repairer/claimant/driver/address/phone), entity_value, linked_claim_ids, link_type
- [ ] Build collusionRings table: ring_id, member_entity_ids, evidence_summary, confidence_score, investigation_status
- [ ] Add collusion signals to crossClaimSignals: repairer_claimant_address_match, director_is_claimant, phone_ring_detected, address_ring_detected
- [ ] Admin UI: Intelligence Registry page — searchable table of repairers with risk tier, claim count, fraud flags
- [ ] Admin UI: Entity Graph page — visual network of linked entities for a given claim
- [ ] Admin UI: Collusion Rings page — list detected rings with evidence and investigation status
- [ ] Add repairer intelligence summary to fraud report section in ForensicAuditReport
- [ ] Ensure absence from registry is NOT treated as fraud — all new entities start at risk tier A (neutral)

---

## Image Subsystem — Pending Fixes

- [ ] Fix: Cost model not populating line items into assessment record (silent bug — line items extracted but not persisted)
- [ ] Fix: Report missing critical sections when image analysis fails (assessor remarks, cost breakdown, evidence summary should degrade gracefully, not disappear)
- [ ] Add image classification pre-step: distinguish page renders vs damage photos vs document scans before vision analysis
- [ ] Re-run BMW 318i case study: target consistencyScore > 70, criticalFailures = 0

---

## Structural / Product Decisions (Requires Discussion)

- [ ] Two render modes for ForensicAuditReport: "Decision View" (1-page adjuster summary) vs "Full Audit View" (current 23-page methodology)
- [ ] Move Glossary (Appendix B) to true appendix position — currently renders inline after Section 9

---

## ML Cost Prediction — Training Data Pipeline (Awaiting Data)

- [ ] Build training data export: extract (vehicle, damage zone, part, labour hours, cost) tuples from completed claims
- [ ] Define feature schema for ML model input (vehicle age, make, model, damage severity, repair type)
- [ ] Evaluate model options: gradient boosting vs neural net for cost range prediction
- [ ] Build confidence interval output: predicted cost ± range, not point estimate
- [ ] Wire ML prediction into KINGA Estimate as a second signal alongside rule-based estimate

---

## Fleet / Company Claimant — Remaining Items

- [ ] Fleet dashboard: show aggregate claim cost by vehicle, by driver, by period
- [ ] Fleet risk scoring: flag vehicles or drivers with abnormal claim frequency
- [ ] Fleet PDF report: exportable summary of all fleet claims for a given period

---

## Recovery / Subrogation — Remaining Items

- [ ] Recovery case timeline view: show all events (demand sent, response received, escalation, settlement) in chronological order
- [ ] Recovery outcome analytics: recovery rate by claim type, by third-party insurer, by legal firm
- [ ] Automated follow-up reminder: if no response within 14 days of demand letter, trigger notification to recovery officer

---

## Executive Dashboard v2 Implementation

### Phase 1: Critical Fixes
- [x] Replace hardcoded DEMO_MONTH_COMPARISON with real analytics.getMonthComparison procedure
- [x] Add recovery report case handlers (recovery.case_summary, recovery.performance, recovery.third_party_profiles) to generateReportHtml
- [x] Fix Net Exposure formula in analytics.getFinancialOverview (totalReserves - totalRecovered)

### Phase 2: Visual Redesign
- [x] Add Inter font via Google Fonts CDN in client/index.html
- [x] Add exec design tokens to client/src/index.css
- [ ] Create ExecutivePeriodContext with global period state (deferred — requires state management refactor)
- [x] Redesign dashboard header (white bg, strong bottom border, period selector, action buttons)
- [x] Redesign tab navigation (underline style, emerald active)
- [x] Redesign KPI cards (white bg, 4px coloured left border, Inter font, tabular numbers)
- [ ] Wire all existing queries to consume period context (deferred — depends on ExecutivePeriodContext)
- [ ] Add Demo Mode banner (deferred)

### Phase 3: New Components
- [x] analytics.getExecutiveAlerts procedure + Executive Alerts Centre component
- [x] analytics.getMonthComparison procedure + Month Comparison Strip component (real data)
- [x] analytics.getClaimsAgeing procedure + Claims Ageing Panel component
- [ ] analytics.getEscalationCounts procedure + Escalations Dashboard component
- [x] analytics.getFraudInvestigationFunnel procedure + Investigation Funnel component
- [ ] crossClaim.getTopEntities procedure + Cross-Claim Intelligence panel
- [ ] analytics.getSettlementTrend procedure + Settlement Trend chart
- [ ] governance.getExceptionsRegister procedure + Governance Exceptions Register
- [x] Add Leakage tile to Financial Overview
- [ ] Wire Recovery Dashboard to recovery.getKPIs + recovery.getCases

### Phase 4: Executive Report
- [x] executive.full_report added to REPORT_ACCESS + switch statement in reportDefinitions.ts
- [x] generateExecutiveFullReport HTML template (7 sections)
- [x] AI narrative integration (6 LLM calls, parallel)
- [x] Tab 6 (Executive Reports) UI with generation form and progress indicator
- [x] Recent reports table wired to reportingEngine.getMyJobs

---

## OBSOLETE — Items to Delete on Next Cleanup
> These sections existed in the original todo.md but have been fully superseded.
> Safe to delete entirely:

- Phases 1–11 (original scaffold phases — all done)
- "Continuation Phase", "Final Build Phase", "Final Features Implementation" — all done
- "Code Quality & Optimization Phase" — all done
- "Advanced Features Phase" — all done
- "Final Polish & Deployment Preparation" — all done
- "Document Management Feature" — all done
- "Testing Phase" (original) — superseded by current test coverage
- "Report Format Fix (Critical)" — all done
- "Bug Fixes & Testing" (original) — all done
- "Final Enhancements" — all done
- "UI Redesign & Advanced Features" — all done
- "Real-Time Notifications System" — all done
- "Comprehensive Fraud Detection System" (original 300-line section) — superseded by Intelligence Registry above
- "System Integration & UI Implementation" — all done
- "Additional Engineering Features (Immediate)" — all done
- "Immediate Engineering Features Implementation" — all done
- "Bug Fixes (Continued)" — all done
- "UI/UX Improvements" — all done
- "Fraud Analytics Dashboard Implementation" — superseded by Intelligence Registry
- "Weather API Integration" — deferred indefinitely
- "Vehicle Database Integration" — done (NHTSA integration complete)
- "Manual Assessment Analysis" sections — done
- "Handwritten Quote Processing" — done
- "Today's Implementation - Police Report & Vehicle Valuation" — done
- "Test Data Creation for End-to-End Testing" — done
- "End-to-End Testing Preparation" — done
- "Fraud Detection Enhancements" — superseded by Intelligence Registry
- "UI Color & Visual Enhancements" — done
- "Colorful UI Enhancements" — done
- "Final Implementation - Assessor Dashboard, OCR & Reports" — done
- "Final Tasks for Today (Feb 6, 2026)" — done
- "Portal Selection Landing Page" — done
- "Role Switcher for Testing" — done
- "Fix Role Switcher Redirect" — done
- Phases 1–7 (Go-Live Preparation roadmap) — superseded by current architecture
- Phases 13–32 (sprint phases through May 2026) — all completed
- "Strategic Review Backlog (2026-05-10)" — all done
- "Design & Format Consistency Audit (2026-05-10)" — all done
- "Combined Reviewer Fixes" — all done
- "Format Consistency Sprint" — all done
- "Dashboard Role-Access Sprint" — all done
- "Structured Note Display + Photo Classification Caching Sprint" — done
- "Bug Fix: isLateSubmission ReferenceError" — done
- "C-06 Removal + Days-to-Claim Fix" — done
- "Production Crash Fixes (May 2026)" — done
- "Branding Cleanup (May 2026)" — done
- "Issues Batch — May 11 2026" — done
- "Line Item Extraction Root Cause Fix — May 11 2026" — done
- "Report PDF Review Fixes — May 11 2026" — done
- "Company / Fleet Claimant Feature — May 12 2026" — done (core feature)
- "Fleet Expansion — Phase 2" — partially done; remaining items moved to Fleet section above
- "Dashboard Demo Data & Tab Improvements" — done
- "Presentation Polish (2026-05-13)" — done
- "Brand Cleanup (2026-05-13)" — done
- "Pipeline Reliability Fix (2026-05-13)" — done
- "Portal Hub & Currency Fix (2026-05-13)" — done
- "Pipeline Fix & Branding (2026-05-14)" — done
- "CRITICAL: Pre-Presentation Fixes (May 14)" — done
- "System Reliability: First-Try Upload Success" — done
- "Server Stability — OOM Prevention" — done
- "Upload 503 Fix — Multipart Endpoint" — done
- "Pipeline Fix — Remove pdftoppm dependency" — done
- "Cloud Run Native Binary Fix" — done
- "Quote Line Item Hardening" — done
- "Quote Line Item Persistence & UI Display" — done
- "Claim Truth Layer (CTL) — Pipeline Integration Fix" — done
- "Cross-Quote Gap Analysis Engine" — done
- "KINGA Savings Dashboard Audit" — done
- "Forensic Report Quality Improvement" — done (FAR fix plan above)
- "Hallucination / Inconsistency / Fraud Score Fixes" — done
- "Comprehensive Report Quality Audit (Jun 2026)" — done
- "Quotation Extraction Audit (Chevrolet Trailblazer)" — done
- "Multi-Quote Report Display Bug" — done
- "Multi-Quote Extraction Permanent Fix" — done
- "Fraud Scoring Redesign (2026-06-12)" — done
- "NHTSA Vehicle Structural Intelligence Integration" — done
- "Vehicle Structural Intelligence — COMPLETED" — done
- "ML Production Implementation (Phase 1–4)" — partially done; remaining items moved to ML section above

---

## Claims Manager Portal Realignment — Phase 1: Production Defect Fixes

- [x] D-01: Implement claims.closeForProcessing procedure (replaces incorrect approveClaim usage)
- [x] D-01: Update CloseForProcessingDialog to call new procedure + capture closureReason
- [x] D-02: Implement claims.escalateClaim procedure (escalation ≠ send-back)
- [x] D-02: Build EscalateClaimDialog component
- [x] D-02: Wire Escalate button in Fraud Alerts tab to EscalateClaimDialog
- [x] Phase 1 vitest tests for closeForProcessing and escalateClaim

---

## Claims Manager Portal Realignment — Phase 2: Operational Command Centre

- [x] F-01/F-06/F-07: Implement claims.getQueueHealthMatrix procedure
- [x] F-02: Implement claims.getAttentionRequired procedure
- [x] F-04: Implement claims.getApprovalWorkbenchMetrics procedure
- [x] F-05/M-06: Implement claims.getCapacityForecast procedure
- [x] F-01: Build QueueHealthMatrix component (Row 1)
- [x] F-02: Build AttentionRequiredWidget component (Row 2 left)
- [x] F-03: Build EscalationCentre component (Row 2 right)
- [x] F-04: Build ApprovalWorkbench component (Row 3 left)
- [x] F-05: Build CapacityForecast component (Row 3 right)
- [x] R-01: Demote KPI cards to compact horizontal strip
- [x] F-08: Add Fleet Approvals to sidebar navigation
- [x] Phase 2: Integrate all new components into ClaimsManagerDashboard layout
- [x] Phase 2 vitest tests for all four new procedures

---

## Claims Manager Portal Realignment — Phase 3: Management Intelligence

- [x] M-02: Implement workflowAnalytics.getSendBackAnalytics procedure
- [x] M-03: Implement recovery.getWatchlist procedure
- [x] M-01: Build WorkforceIntelligence component (Row 4) — Processor + Assessor + Workload panels
- [x] M-03: Build RecoveryWatchlist component
- [x] M-03: Replace Recovery KPI row with RecoveryWatchlist
- [x] M-04: Build OperationalFraudQueue component — groups fraud alerts into 4 actionable categories
- [x] M-05: Add ClaimsManagerReportsCentre (13 authorised reports surfaced)
- [x] M-05: Add per-claim report buttons to Review Queue tab (assessment, audit trail, cost comparison)
- [x] M-02: Add structured sendBackReason enum to send-back dialog (7 categories)
- [x] Phase 3 vitest tests (getSendBackAnalytics, recovery.getWatchlist)

---

## Claims Manager Portal Realignment — Phase 4: Refinements

- [x] R-03: Implement claims.reopenClaim procedure (closed → disputed)
- [x] R-03: Add Reopen action to Processed Claims tab with Reopen Claim dialog
- [ ] R-04: Record automation threshold in workflow_audit_trail.metadata at approval — backlog
- [x] R-05: Validate targetRole against WORKFLOW_TRANSITIONS in sendBackClaim procedure
- [ ] R-06: Merge Recently Closed card into Processed Claims tab — backlog
- [ ] Add KPI trend sparklines to compact KPI strip — future enhancement

---

## Claims Manager Portal Realignment — Maintainability Refactor

- [x] Extract ClaimsManagerCommandCentre.tsx wrapper (Rows 1–5 + Reports Centre)
- [x] ClaimsManagerDashboard.tsx reduced from 1,567 lines to 1,542 lines (command centre rows replaced by single wrapper)
- [ ] R-04: Record automation threshold in workflow_audit_trail.metadata at approval — future enhancement
- [ ] R-06: Merge Recently Closed card into Processed Claims tab — future enhancement
- [ ] Add KPI trend sparklines to compact KPI strip — future enhancement

---

## UI Redesign — Claims Manager & Executive Dashboards (June 2026)

- [ ] Fix AttentionRequiredPanel tile layout — min-widths, label/value separation, no text wrapping mid-word
- [ ] Fix ClaimsManagerCommandCentre section headers, spacing, panel hierarchy
- [ ] Fix Reports Centre grid — remove text truncation, improve 2-column layout
- [ ] Redesign ClaimsManagerDashboard tab arrangement — logical grouping, clear labels, consistent spacing
- [ ] Redesign Executive Dashboard — layout rhythm, tab arrangement, typography hierarchy

---

## KINGA Brand & Portal Design System (June 2026)

- [x] Create KINGA Brand & Design System document (brand/KINGA_Brand_Design_System.md)
- [x] Create KINGA Brand Reference HTML page (brand/KINGA_Brand_Reference.html)
- [x] Create KINGA Portal Governance & Alignment Audit v1.0 (brand/KINGA_Portal_Governance_Audit_v1.0.md)
- [x] Build KingaPortalShell unified component (client/src/components/KingaPortalShell.tsx)
- [x] Rebuild Assessor Dashboard as full operational workspace (My Queue, Appointments, Performance tabs)
- [x] Fix Claims Processor Dashboard — replace teal gradient header, foreign-colour stat cards, fix chart colours
- [x] Fix Claims Manager Dashboard — brand-aligned header, KPI strip, tab bar, chart colours
- [x] Fix Executive Dashboard — brand-aligned KPI cards, stat bar, tab bar, chart colours
- [x] Fix DashboardLayout sidebar active state — KINGA forest green left-border indicator
- [x] Fix ExecutiveAnalyticsCharts — all foreign colours replaced with KINGA brand palette
- [ ] Apply KingaPortalShell to remaining portals: Admin, Panel Beater, Claimant, Fleet Manager, Risk Manager, Recovery, Insurer Admin
- [ ] Implement portal certification checklist (85% pass threshold per KINGA_Portal_Governance_Audit_v1.0.md)
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar
