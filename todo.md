# KINGA Platform — Active Todo List
# Audited: June 2026 | Replaced 12,469-line accumulation with clean active list

---

## Reports — Claims Intelligence & Forensic Claim Decision (Completed July 2026)

- [x] Build shared KINGA CSS design system (kingaDesignSystem.ts)
- [x] Build Claims Intelligence Report generator (claimsIntelligenceReport.ts) — 6 sections: §1 Claim Identity, §P Policy & Coverage, §2 Cost Intelligence, §3 Risk Indicators, §4 Evidence Snapshot, §5 Decision & Next Steps + upgrade banner
- [x] Redesign Forensic Claim Decision Report (forensicDecisionReport.ts) — v7 design: compact rows, SVG speed scale, damage zone map, Chart.js fraud radar, photo forensics grid, 5-stage workflow
- [x] Register claim.intelligence in REPORT_ACCESS, REPORT_CATALOGUE, dispatcher, and UI
- [x] Route claim.forensic to new v7 generateForensicDecisionReport generator
- [x] Remove redundant claim.forensic_decision key (claim.forensic is canonical)
- [x] Write full test suite: 111 tests covering access control, column mapping, HTML structure, design system, UI wiring (server/kinga-reports.test.ts)

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
- [ ] **POST-LAUNCH: Fix C larger-sample validation** — Run imageClassifier on 100+ claims processed before Fix C (checkpoint 22811f0f) and confirm `quote_with_embedded_photo` category fires correctly for document pages with incidental vehicle images. Spot-check found one case (VOLTRON page-002: accident sketch form) that reached photoForensicsEngine as a document page in the pre-fix pipeline. Validate Fix C catches these at the classifier stage, not downstream. Target: zero document pages reaching Stage 6 vision analysis.
- [ ] **POST-LAUNCH: Claimant photo-capture UX proposal** — Design and implement a guided photo-capture flow for claimants submitting via the portal. Goal: ensure at least one close-up, perpendicular, front-crush-zone photograph with a visible scale reference is captured per claim. Current portfolio has 23% of claims falling back to deployment-threshold/momentum-only speed estimation because no SUITABLE crush-depth image exists. A guided capture flow ("Take a photo of the front bumper from directly in front, within 1 metre") would directly improve physics input quality. Requires: UX design, mobile-first implementation, integration with the claim submission flow.
- [ ] **POST-LAUNCH: Physics confidence label audit** — After 50+ new claims are processed with Fixes A/B/C in place, audit the distribution of MEDIUM vs LOW vs HIGH confidence speed estimates to confirm the 77% usable-crush-depth rate holds on new submissions vs the pre-fix portfolio.

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

---

## Brand Alignment Sprint — June 2026

- [x] Build KingaPortalShell unified component (PortalHeader, PortalKPIStrip, PortalAlerts, PortalTabs, PortalContent)
- [x] Rebuild Assessor Dashboard as full operational workspace (My Queue, Appointments, Performance tabs)
- [x] Fix Claims Processor Dashboard — replace teal gradient header, foreign-colour stat cards, chart colours
- [x] Fix Claims Manager Dashboard — brand-aligned header, KPI strip, tab bar, chart colours
- [x] Fix Executive Dashboard — brand-aligned KPI cards, stat bar, tab bar, chart colours
- [x] Fix DashboardLayout sidebar active state — KINGA forest green left-border indicator
- [x] Fix ExecutiveAnalyticsCharts — all foreign colours replaced with KINGA brand palette
- [x] Fix Admin Dashboard — remove gradient, fix emerald active buttons, fix KPI stat colours
- [x] Fix Risk Manager Dashboard — replace foreign accent colour classes with brand hex values
- [x] Fix Panel Beater Dashboard — fix page background, header text, tier badge colours
- [x] Fix Fleet Manager Dashboard — fix KPI icon/value colours, status badges, tab active state, empty state icons
- [x] Fix Claimant Dashboard — fix stepper colours, status badge classNames, header status pill
- [x] Fix Recovery Portal — fix tab config colours, deadline badges, header icon, warning banner
- [x] Fix Insurer Admin Dashboard — fix role badges, KPI card colours, claim status badges, activity icons
- [x] Create KINGA Brand & Design System document (brand/KINGA_Brand_Design_System.md)
- [x] Create KINGA Brand Reference HTML page (brand/KINGA_Brand_Reference.html)
- [x] Create KINGA Portal Governance & Alignment Audit v1.0 (brand/KINGA_Portal_Governance_Audit_v1.0.md)
- [ ] Apply portal certification checklist (85% pass threshold) to all 11 portals
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar
- [ ] Apply KingaPortalShell header component to Panel Beater, Claimant, and Fleet portals (currently use custom headers)

---

## Sprint 1 — Decision Alignment (June 2026)

- [x] Create shared SLADeadlineChip component (client/src/components/portal/SLADeadlineChip.tsx)
- [x] Recovery Portal: replace local deadlineChip with shared SLADeadlineChip
- [x] Claims Processor Dashboard: replace local SLA badge with shared SLADeadlineChip
- [x] IntakeQueueTab (Claims Manager): add SLADeadlineChip to claim rows
- [x] Panel Beater Dashboard: add SLADeadlineChip to pending request claim rows
- [x] AttentionRequiredPanel: already persistent above Claims Manager tab bar (inside ClaimsManagerCommandCentre) — no change needed
- [x] Executive Dashboard: add SLA Compliance Rate KPI to secondary KPI strip (5th cell, sage teal)
- [x] Claims Processor Dashboard: add Throughput (7d) and Rework Rate KPIs to KPI strip (8-cell grid)
- [x] Recovery Portal: integrate PortalHeader from KingaPortalShell (replaces custom header div)
- [x] Assessor Dashboard: already uses full KingaPortalShell — no change needed
- [ ] Add keyboard arrow-key navigation to Claims Manager custom tab bar
- [ ] Apply KingaPortalShell header component to Panel Beater, Claimant, and Fleet portals
- [ ] Implement portal certification checklist (85% pass threshold per KINGA_Portal_Governance_Audit_v1.0.md)

---

## Sprint 2 — Operational Completeness (baseline: checkpoint 9c78f96a, 218 TS errors)

- [x] T1: Claims Manager — WorkloadDistributionPanel (new tRPC query, per-assignee backlog)
- [x] T2: Executive — ExecutiveEscalationQueue (reuse financial threshold, no new threshold constant)
- [x] T3: Claims Processor — assessor assignment action (already implemented: trpc.claims.assignToAssessor, dialog at lines 672/826)
- [x] T4: Risk Manager — false positive rate KPI (fraudRules.falsePositiveCount / truePositiveCount, getFraudRuleAccuracy procedure)
- [x] T5: Risk Manager — geographic risk clustering table in Fraud Intelligence tab (getGeographicRiskClusters, GeographicRiskClustersPanel)
- [x] T6: Admin — PendingRegistrationQueue + deactivate/role-change user actions (admin.getPendingRegistrations/deactivateUser/updateUserRole)
- [x] T7: Panel Beater — D-07 chip confirmed at lines 378/493; Acceptance Rate KPI already present at line 149 (approvedQuotes/submittedQuotes)
- [x] T8: Claimant — settlement acceptance button + dispute initiation action (acceptSettlement/initiateDispute mutations + confirm dialogs)
- [x] T9: Insurer Admin — PendingTeamRequestQueue component (reuses teamMembers.listInvitations/cancelInvitation/resendInvitation)
- [x] T10: Recovery — full KingaPortalShell migration + PortalKPIStrip visual parity

---

## Combined Sprint 2 Fix Pass + Sprint 3 (June 22, 2026)

### Phase 0 — Risk Manager C4/C7 Investigation
- [x] Phase 0: Investigate Risk Manager SLADeadlineChip / AttentionRequired regression vs scoring error; document findings; restore if warranted

### Phase 1 — Sprint 2 Must-Fix Defects
- [x] Task 1: D-S2-05 — Surface dispute reason in Claims Manager claim detail + notifyOwner trigger in initiateDispute
- [x] Task 2: D-S2-03 — WorkloadDistributionPanel staleness fix (poll interval or cross-portal invalidation)

### Phase 2 — Sprint 2 Deferred Fixes
- [x] Task 3: D-S2-02 — Consolidate financial threshold into server/shared/constants.ts
- [x] Task 4: D-S2-04 — Add isActive/deactivatedAt to user schema; update deactivateUser + getPendingRegistrations

### Sprint 3 — Fleet Manager + Recovery Completion
- [x] Task 5: Fleet Manager Vehicle Tracking tab (real data, stubs flagged) — already complete in prior sprint
- [x] Task 6: Fleet Manager Risk Analytics tab (claim frequency + driver risk) — already complete in prior sprint
- [x] Task 7: Fleet Manager escalation action on claim rows (Option A: flagClaimForReview procedure + dialog + AttentionRequiredPanel Rule 8)
- [x] Task 8: Confirm Fleet Manager SLADeadlineChip still present (D-03 regression check) — confirmed at line 532 of FleetManagerDashboard.tsx
- [x] Task 9: Recovery settlement offer receipt + accept/reject on case rows — already complete in RecoveryCaseDetail.tsx (settlementModal, settled_full/partial, recoveredAmount)
- [x] Task 10: Recovery legal escalation workflow on case rows — already complete (disputed_legal status, legal_escalation responseOutcome, caseNotes timestamp)
- [x] Task 11: Recovery stalled case detection (90-day indicator) — already complete (SLADeadlineChip on case rows, 90-day deadline banner, getKPIs in90Days window)

---

## Sprint 4 Audit Defect Fixes (June 22, 2026)

- [x] D-S4-02: Replace 2 residual hardcoded 2500000 values in server/routers.ts with FINANCIAL_APPROVAL_THRESHOLD_CENTS (lines ~3187, ~9657); add import to server/routers.ts
- [x] D-S4-01 (optional): Remove EXEC_FINANCIAL_THRESHOLD_CENTS alias in executive.ts; use FINANCIAL_APPROVAL_THRESHOLD_CENTS directly at both call sites

---

## Sprint 5 — Shell Migration Sprint (June 22, 2026)

Baseline: checkpoint 95a8ea31 | TS errors: 220 (all pre-existing)
Reference pattern: Recovery T10 migration (rendering-only, no data source changes)

- [x] S5-P1: Claims Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P2: Fleet Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2)
- [x] S5-P3: Claims Processor — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P4: Executive — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C4)
- [x] S5-P5: Risk Manager — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C7)
- [x] S5-P6: Panel Beater — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3)
- [x] S5-P7: Claimant — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7)
- [x] S5-P8: Admin — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7)
- [x] S5-P9: Insurer Admin — KingaPortalShell + PortalKPIStrip migration (needs C1, C2, C3, C4, C5, C7, C9)
- [x] S5-FINAL: 11-portal certification scorecard + remaining gaps report

## Sprint 6 — Certification Closure

- [x] S6-T1: Claims Processor — replaced remaining 3 foreign orange instances with KINGA gold (#D4A843/#8A5C00); prior sprint had already resolved the other 43
- [x] S6-T2a: Claims Processor — monetary formatting already uses fmt() from prior sprint; toLocaleString() calls are date formatting only (not currency)
- [x] S6-T2b: Fleet Manager — monetary formatting already uses fmt() from prior sprint
- [x] S6-T3a: Fleet Manager — tab navigation already uses p11-tab-item pattern (design system standard)
- [x] S6-T3b: Claims Processor — tab navigation already uses p11-tab-item pattern
- [x] S6-T3c: Claimant — tab navigation already uses ProtoTabBar
- [x] S6-T4: Claimant — foreign colour instances already resolved in prior sprint
- [x] S6-T5: PortalAlerts audit complete — 8/10 portals use PortalAlerts; ClaimsManager uses custom alert bar (Layer 3, real data); RecoveryPortal uses ProtoAlertBar — both functionally equivalent
- [x] S6-T6: Empty/error states already present in all 4 portals (Fleet: FileText icon + message; PanelBeater: text; Claimant: isLoading guard; InsurerAdmin: loading placeholders)
- [x] S6-VERIFY: FleetManager purple ai_complete badge replaced with KINGA forest green (#E7F1EA/#1C5C39); 196 TS errors confirmed pre-existing (unchanged from baseline)

## Phase 11 — Design System Implementation

- [ ] P11-1: CSS token foundation — index.css overhaul (g-950→g-100, gold, cream, tabular-nums, JetBrains Mono)
- [ ] P11-2: Rebuild KingaPortalShell — IdentityStrip + HeroBand + PortalKPIStrip + TabBar + AlertBar
- [ ] P11-3: Claims Manager — Phase 11 reskin (data table, escalation queue, attention panel)
- [ ] P11-4: Executive Dashboard — Phase 11 reskin (Overview tab: ageing chart, fraud funnel, escalation queue, period comparison, AI confidence)
- [ ] P11-5: Risk Manager — Phase 11 reskin
- [ ] P11-6: Claims Processor — Phase 11 reskin
- [ ] P11-7: Fleet Manager — Phase 11 reskin
- [ ] P11-8: Claimant — Phase 11 reskin
- [ ] P11-9: Panel Beater — Phase 11 reskin
- [ ] P11-10: Admin, Insurer Admin, Assessor, Recovery — Phase 11 reskin
- [ ] P11-11: Full visual QA + TS baseline + checkpoint

## Batch 7 — Infrastructure Hardening (R-INF)

- [x] R-INF-08: DATABASE_URL startup validation — hard fail (process.exit 1) in prod, warn in dev
- [x] R-INF-01: DB query timeout — add per-query SET SESSION max_execution_time wrapper
- [x] R-INF-02: LLM retry — stage-3 llmCall() wrapper (4 call sites) — add withRetry
- [x] R-INF-03: LLM retry — stage-5 vehicle valuation (line 456) — add withRetry around withTimeout
- [x] R-INF-04: LLM retry — stage-7b causal reasoning (3 call sites) — add withRetry
- [x] R-INF-05: LLM retry — stage-6 PDF pass-1 and pass-2 — add withRetry
- [x] R-INF-06: LLM retry — quoteExtractionEngine (7 call sites) — add withRetry
- [x] R-INF tests: write audit tests for all R-INF-01 through R-INF-08 fixes (25/25 passing)
- [x] R-INF-07: LLM retry — assessment-processor.ts (6 bare invokeLLM calls) — wrapped in withRetry (13 audit tests passing)
- [x] R-INF-09: Add documentation comments at users.role enum and agencyProcedure guard (agency role built but not yet activated)
- [ ] R-INF-09-backlog: When agency portal is greenlit — add 'agency' to users.role enum + roleAssignmentAudit enums (migration required)

## R-B-03b — Night-Photo Misclassification (Recovered from ID collision)

- [x] R-B-03b: imageIntelligence.ts — night-time / low-brightness damage photos silently classified as "document" because meanBrightness is not used in scoreDamageLikelihood(). Dark images (meanBrightness < ~60) score below LOW_CONFIDENCE_THRESHOLD (0.40) and are dropped without LLM fallback. Fix: add dark-image rescue path — if meanBrightness < 80 AND colourVariance > 0.05, push to ambiguousPool regardless of heuristic score. (Original R-B-03 finding; ID collision with Batch 6 R-B-03 enrichedPhotosJson fix discovered 2026-07-09.)

## R-CX-01c — Currency Wiring Completion

- [x] R-CX-01c (a): AssessmentResults.tsx — useTenantCurrency wired to CostBreakdownChart (checkpoint 370e5b96)
- [x] R-CX-01c (b): ForensicDecisionPanel.tsx — hardcoded $ on true_cost_usd replaced with fmt() (17 audit tests passing)
- [x] R-CX-01c (c): stage-5-assembly.ts — vehicle valuation LLM prompt generalised for multi-currency markets; tenantCurrencyCode/tenantCountryName derived from ctx.tenantCountry; isZimbabwe guard preserves Zimbabwe-specific market context (17 audit tests passing)

## Architectural Governance — 3 Failing Test Clusters

- [x] ARCH-01: quoteOptimisationEngine — updated tests to Title Case canonical names; added 'f/bar' alias to shared/vehicleParts.ts; all 50 tests pass
- [x] ARCH-02: decisionReadinessEngine — updated tests to expect WARN / is_critical:false for ABSENT/UNKNOWN photo status; all 52 tests pass
- [x] ARCH-03: weighted-fraud-scoring — FSS-2026-001 formal standard drafted; shared/fraudScoring.ts created as single source of truth; 16 consumer files migrated; 'medium' → 'moderate' across pipeline; 49 boundary tests pass

---

## Batch 8 — Observability & Structured Logging (R-OBS)

**Design decisions confirmed by user (2026-07-09):**
- R-OBS-03: Use module-level logger singleton — NOT an optional per-call callback parameter. Callback approach reintroduces the 'silently missing' failure pattern found throughout the audit. Must be consistent with how withRetry/withTimeout were applied globally.
- R-OBS-05: User requires the list of 8 highest-risk engines before ranking. Present the list first, get ranking, then implement.

### R-OBS-03 — Structured Logger Singleton
- [x] R-OBS-03: Create server/logger.ts — module-level structured logger singleton; 22/22 tests pass (server/logger.test.ts). Wired into all 4 ctx.log construction sites in db.ts and routers.ts.

### R-OBS-05 — Engine-Level Timing & Observability
- [x] R-OBS-05-SCOPE: Present list of 8 highest-risk engines to user for ranking before implementation
- [x] R-OBS-05: Add per-engine timing instrumentation to the 8 ranked highest-risk engines. runWithTimeout covers stages 1,2,6,7,8,9,10; orchestrator.ts direct calls cover stage-3, stage-5, 7b-causal-reasoning. 29/29 tests pass (server/batch8-observability.test.ts).

### Other R-OBS items (pending scope confirmation)
- [x] R-OBS-01: claimId threaded through all pipeline stages via logger.makePipelineLog(claimId) at all 4 ctx.log construction sites. Every pipeline log line carries a structured claimId field.
- [x] R-OBS-02: logger.retry() wired into withRetry in server/_core/llm.ts — WARN for non-final attempts, ERROR for exhaustion. Carries engineLabel, attempt, maxAttempts, error message, and optional meta fields.
- [x] R-OBS-04: logger.stage() wired into onStageComplete callback in server/db.ts — emits structured stage completion events with stageId, durationMs, status (completed/degraded/failed/skipped), and claimId.

---

## ARCH-03b — DB Write Path Data Corruption Fix (moderate→low silent downgrade)

**Root cause confirmed (2026-07-10):** fraudLevelMap in server/db.ts is missing 'moderate' key. Pipeline now produces 'moderate' (scores 40–60) but the map falls through to 'low'. DB schema enum also does not include 'moderate'. 22 historical rows stored as 'medium' (pre-ARCH-03). 0 rows stored as 'moderate' (all silently written as 'low' since ARCH-03).

- [x] ARCH-03b-AUDIT: 0 claims affected (no claims processed in 40–60 band since ARCH-03 deploy); 22 historical 'medium' rows confirmed (pre-ARCH-03, correct at time of writing); no manual re-flagging required
- [x] ARCH-03b-FIX1: Schema migration applied via direct SQL (arch03b-add-moderate-fraud-level.sql); 'moderate' added to all 5 tables (aiAssessments, fraudIndicators, historicalReplayResults, claims, assessorEvaluations); 6/6 verification tests pass
- [x] ARCH-03b-FIX2: fraudLevelMap in server/db.ts updated — moderate:'moderate' added; 13/13 verification tests pass
- [x] ARCH-03b-FIX3: normaliseFraudLevel() and fraudLevelDisplayLabel() added to shared/fraudScoring.ts; applied to AiReanalysisPanel (4 sites), AIAssessmentPanel (3 sites), ClaimReviewDialog (2 sites), notifications.ts email body; 26/26 verification tests pass

---

## Batch 9a — Magic Number Extraction (Readability & Documentation)

- [x] Batch 9a: Extract all magic numbers to named constants across 12 Groups A–H pipeline files (12 commits, one per file). Tag unknowns with `// CALIBRATION: origin unknown, do not change without benchmarking`. Produce `docs/audit/unverified-constants.md` with 60+ entries covering file location, current value, role, and calibration status. 276/283 tests pass (7 pre-existing group-a failures confirmed pre-existing by stash comparison). Checkpoint: pending (see next entry).

---

## Batch 9b/9c — Function Splitting & Comment Gaps (Groups A–H)

- [x] 9b Group A: `_doExtraction` → detectScannedPdf / applyHeuristicRotation / extractEmbeddedImagesFromPage; `runInputRecovery` → detectImagePresence / detectOcrFailure / deduplicateExtractedQuotes + no-split rationale on five-path block; `validateAndNormalise` → coerceTotalCost / validateLineItems / deriveConfidence / coerceLabourAndParts / validateDocumentCategory
- [x] 9c Group A: 8 comment gaps added (pdf-image-extractor.ts, stage-1/2/3, quoteExtractionEngine.ts, documentPreprocessor.ts). Checkpoint: d4dc53e2
- [x] 9b Groups B–D: No splits warranted. No-split rationale comments added to evaluateBehaviouralEnrichment, extractMultipleQuotesFromPageImages, runPhotoForensics
- [x] 9c Groups B–D: 5 comment additions (scenarioFraudEngine.ts, quoteExtractionEngine.ts, claimQualityScorer.ts, evidenceStrengthScorer.ts, photoForensicsEngine.ts). Checkpoint: 0111e47d
- [x] 9b Groups E–H: No splits warranted. No-split rationale comments added to runPipelineV2, runCostOptimisationStage, runPhysicsStage, runCausalReasoningEngine
- [x] 9c Groups E–H: Architecture JSDoc added to runDamageAnalysisStage, runCostOptimisationStage, runPhysicsStage, runCausalReasoningEngine, runCostDecision, evaluateDecisionReadiness, runPipelineV2
- [x] Regression gate: 370/372 tests pass; 2 costDecisionEngine + 7 group-a + 12 quoteExtractionEngine failures confirmed pre-existing

---

## Batch 9b/9c addendum + Batch 9d — Navigational Maps & Module-Level Comments

- [x] Navigational map with line ranges added to runPipelineV2 JSDoc (orchestrator.ts) — 11-stage outline, two parallel execution points, no-split rationale
- [x] Navigational map with line ranges added to runAssemblyStage JSDoc (stage-5-assembly.ts) — step-by-step section outline with line ranges
- [x] Batch 9d: module-level orientation comments added/expanded for all Groups A–H files:
  - stage-3-structured-extraction.ts: three-path extraction architecture, key functions table (from 9b/9c work)
  - stage-8-fraud.ts: four-engine fraud architecture, score aggregation overview (new)
  - All other files confirmed to already have adequate module-level comments
- 235/249 tests pass; 14 pre-existing failures confirmed (quoteExtractionEngine x12, costDecisionEngine x2)
---
## Batch 9e — Mermaid Flowcharts for All Groups A–H Pipeline Modules
- [x] Group A (5 flowcharts): pdf-image-extractor, stage-1-ingestion, stage-2-extraction, stage-3-structured-extraction, quote-extraction-engine
- [x] Group B (3 flowcharts): image-intelligence, image-classifier, document-preprocessor
- [x] Group C (3 flowcharts): evidence-strength-scorer, claim-quality-scorer, speed-inference-ensemble
- [x] Group D (2 flowcharts): scenario-fraud-engine, photo-forensics-engine
- [x] Group E (2 flowcharts): quote-optimisation-engine, stage-5-assembly
- [x] Group F (2 flowcharts): stage-6-damage-analysis, stage-7-physics
- [x] Group G (3 flowcharts): stage-7b-causal-reasoning, stage-8-fraud, stage-9-cost
- [x] Group H (3 flowcharts): cost-decision-engine, decision-readiness-engine, orchestrator
- [x] All 18 .mmd source files verified to render without parse errors; all 18 .png renders verified visually
- [x] Regression gate: 483/485 tests pass in core pipeline suite; 2 costDecisionEngine failures confirmed pre-existing
- [x] All 46 files committed to main: commit d28b503a

---
## Batch 10a — Silent Bug Investigation + 3 Fixes (2026-07-10)

- [x] Investigate: line-item persistence bug (documentedLineItems gap) — confirmed historical-only, 2 claims affected
- [x] Investigate: image-failure report degradation — confirmed PipelineConfidencePanel was never rendered
- [x] Investigate: BMW 318i consistencyScore feasibility — blocked (no real claim doc; test fixtures were stale)
- [x] Fix 1: Wire PipelineConfidencePanel into ForensicAuditReport main render + pass enforcement.degradationReasons
- [x] Fix 2: Add db.ts guard warning when quotesToPersist is empty despite non-zero documentedOriginalQuoteUsd
- [x] Fix 3: Update 10 stale imageClassifier.test.ts fixtures/assertions to match current classifier design (blur scale + fallbackPool routing)
- [ ] Backfill 2 historical quote_line_items records (claims 7260001, 6570001) — low priority, data hygiene

---
## Batch 10b — Live End-to-End Pipeline Run (2026-07-10)

- [ ] Upload VOLTRONMINECOR6002812(1).pdf to S3 and create a real claim record in the database
- [ ] Trigger the live pipeline on the real claim via the API with actual LLM calls
- [ ] Collect and verify: consistencyScore, criticalFailures, report rendering, PipelineConfidencePanel visibility
- [ ] Deliver the full live run report to the user

---
## Batch 10b — Live End-to-End Pipeline Run (VOLTRON-MINECOR-6002812)

- [x] Run live pipeline on real Zimbabwe motor claim (Voltron Mining, Isuzu MUX, Mvuma-Kwekwe Road)
- [x] Fix Stage 5 INCIDENT_CONF_LOW_THRESHOLD scoping error (const declared inside wrong if-block scope)
- [x] Confirm criticalFailures = 0 on live run
- [x] Confirm all 11 stages complete successfully on clean re-run
- [x] Confirm image analysis 20/20 success (100% success rate)
- [ ] Investigate quoteDeviationPct = 234.7% — appears to be a unit mismatch (cents vs USD) in the deviation calculation
- [ ] Investigate consistency_check_json using different field names (critical_conflicts) vs the consistencyScore metric referenced in todo

---
## TRE v4.0 — Autonomous Trust Operations Platform (2026-07-12)
- [x] E1 Trust Event Bus: trustEventBus singleton, conflictDetectedEvent, slaBreachEvent, subscribe/unsubscribe, getClaimEvents, getStats, clearHistory, resetStats
- [x] E2 Trust Impact Analysis Engine: analyseImpact, analyseMultiEventImpact — section propagation, severity, certificate impact
- [x] E3 Autonomous Resolution Queue: createConflictResolutionTask, enqueue, getPendingTasks, resolve, escalate, getStats, clear
- [x] E4 Human-in-the-Loop Governance: humanTrustApprovalEngine.request, decide (APPROVE/REJECT/ESCALATE), getPendingRequests, getClaimRequests, clear
- [x] E5 Trust Memory Engine: trustMemoryEngine.record, getConflictPatterns, generateInsights, getSimilarClaims, getSnapshot, clear
- [x] E6 AI Model Governance: aiModelGovernanceEngine.registerModel, getActiveModels, generateGovernanceReport, clear
- [x] E7 Trust SLA Management: trustSLAManager.start, complete, waive, generatePerformanceReport, clear
- [x] E8 Trust Simulation Engine: trustSimulationEngine.defineScenario, simulate, runBatch, getStandardScenarios
- [x] E9 TRE v4 Governance Router (tre-v4-governance.ts): all tRPC procedures registered — TypeScript clean
- [x] Integration test E1→E2→E3 chain: emit event → analyseImpact → enqueue resolution task → resolve
- [x] Vitest suite: 34/34 tests pass (server/treV4Governance.test.ts)
- [x] Pre-test checkpoint: 46e7ca99

## Physics / Stage 2.6 Fixes — Jul 13 2026
- [x] TRE Fix 1: speed reads ensemble consensusSpeedKmh first (28 km/h for VOLTRON, not 70)
- [x] TRE Fix 2: day-count split — daysToLodge (4402, late-submission gap) vs claimProcessingDays (KINGA age)
- [x] ForensicAuditReport: updated day-count labels to daysToLodge / claimProcessingDays
- [x] Stage 2.6 Fix 3: direct-URL photos now synthesize ExtractedImageInput so classifier runs
- [x] 12/12 regression tests passing (physicsAndStage26Fixes.test.ts)
- [x] VOLTRON re-run verified: cto_speed=28, cto_days_to_lodge=4402, cto_processing_days=406
- [ ] POST-LAUNCH: Phase B-2/B-3 — benchmark evaluation and threshold tuning for imageIntelligence
- [ ] POST-LAUNCH: TRE v3.0/v4.0 frontend wiring (ephemeral state + CTO shape risks documented)

## Physics Engine Strategic Roadmap (July 2026)

### Pre-Launch (Required — 4 days total)
- [ ] **P1 — Velocity range in report** — Replace single consensus speed with low/mid/high km/h range from `physicsNumerical.velocity_range`. Add braking coherence note when stated speed > physics lower bound: "Stated travel speed [X] km/h is consistent with physics lower bound [Y] km/h if the vehicle decelerated over approximately [Z] metres before impact." UI change only — data already in pipeline. (1 day)
- [ ] **P2 — Speed discrepancy → fraud score** — Wire `speedInferenceEnsemble.consensusSpeedKmh` into Stage 8 fraud scoring. When stated speed > 1.5× consensus speed AND confidence MEDIUM/HIGH, add `speed_claim_inconsistency` fraud indicator with calibrated score contribution. Closes the most important missing link between physics and fraud. (2 days)
- [ ] **P3 — Methodology disclosure in report** — Replace "methodology available under confidentiality undertaking" with: method names (Campbell, FMVSS 208, momentum), input sources, assumptions (vehicle mass assumed, friction coefficient assumed, braking not modelled), velocity range, and expert review pathway statement. (1 day)

### Post-Launch Phase 1 (First 90 days — 15 days total)
- [ ] **P4 — Latent damage probability → cost reserve** — Wire `physicsAnalysis.latentDamageProbability` into Stage 9. When engine/transmission/frame probability > 0.3, add hidden damage contingency line to cost estimate and flag for adjudicator. (3 days)
- [ ] **P5 — Energy-conditioned damage pattern validation** — Extend `damagePatternValidationEngine` to accept `energyDissipatedKj` and condition expected component list on both direction AND energy level. A 20 km/h frontal ≠ 60 km/h frontal in expected components. Currently both get identical pattern match. (5 days)
- [ ] **P6 — Physics-grounded cost envelope** — Wire `physicsAnalysis` into `costRealismValidator`. Compute expected cost range from energy × component count × market rates. Flag repair quotes exceeding physics upper bound. This is the most powerful fraud detection capability currently absent from the system. (7 days)

### Post-Launch Phase 2 (90–180 days)
- [ ] **P7 — Braking coherence model** — Implement pre-impact speed model: given stated speed + road type + friction coefficient (0.7 tarmac / 0.4 gravel), compute minimum braking distance and resulting impact speed. Distinguish coherent deceleration from genuine inconsistency. Resolves the 70 km/h vs 28 km/h "contradiction" in VOLTRON and similar claims. (5 days)
- [ ] **P8 — Calibration dataset** — Build ground-truth dataset of claims with known outcomes (fraud confirmed / legitimate / contested). Calibrate fraud score contributions from physics signals empirically. Without calibration, score weights are engineering estimates. (ongoing)
- [ ] **P9 — Expert review integration** — For LOW confidence or plausibility-check-fired claims, add escalation pathway to qualified accident reconstructionist. AI provides structured evidence package; expert provides court-admissible opinion. (10 days)

## Document Reliability Architecture — Phase 1 (Active)

### Phase 2 — Pipeline State Machine
- [x] DRA-P2-1: Add new document pipeline states to claims.documentProcessingStatus in schema.ts: DOCUMENT_VALIDATING, DOCUMENT_READY, ANALYSIS_RUNNING, DOCUMENT_FAILED, RECOVERY_ATTEMPTED, HUMAN_REVIEW_REQUIRED
- [x] DRA-P2-2: Add new claim status values to claims.status enum: document_failed, recovery_attempted, human_review_required
- [x] DRA-P2-3: Update workflow-validator.ts ClaimStatus type and ALLOWED_TRANSITIONS with new states
- [x] DRA-P2-4: Update db.ts triggerAiAssessment() to use new states at each transition point

### Phase 3 — Document Health Gate
- [x] DRA-P3-1: Create server/pipeline-v2/documentHealthGate.ts with 6-dimension ingestion confidence scoring
- [x] DRA-P3-2: Implement Evidence Completeness Contract (required vs optional fields)
- [x] DRA-P3-3: Implement threshold routing: >=90% auto-proceed, 70-90% warn, 40-70% require review, <40% block
- [x] DRA-P3-4: Wire documentHealthGate into db.ts triggerAiAssessment() before pipeline runs

### Phase 4 — Recovery Ladder
- [x] DRA-P4-1: Add pdfimages embedded image extraction as first fallback when pdftoppm produces 0 pages
- [x] DRA-P4-2: Add pdftotext OCR text-only path as second fallback
- [x] DRA-P4-3: Add human escalation path as final fallback (sets HUMAN_REVIEW_REQUIRED state)
- [x] DRA-P4-4: Update pdfToImages.ts renderPdfToImages() to return structured failure reasons

### Phase 5 — No Silent Failure Invariant
- [x] DRA-P5-1: Create server/pipeline-v2/ingestionFailureReport.ts with structured IngestionFailureReport type
- [x] DRA-P5-2: Block assessment_complete unless all 4 conditions met (ingestion passed, analysis executed, confidence threshold, audit trail)
- [x] DRA-P5-3: Trigger notifyOwner on every ingestion failure with failure type and recommended action
- [x] DRA-P5-4: Ensure placeholder path (no PDF + no photos) routes to DOCUMENT_FAILED not assessment_complete

### Phase 6 — TypeScript + VOLTRON + Checkpoint
- [x] DRA-P6-1: TypeScript EXIT:0 on server-check tsconfig (0 errors)
- [ ] DRA-P6-2: VOLTRON re-run (claim 8880001) — confirm pipeline still completes correctly
- [ ] DRA-P6-3: Degraded claim test (claim 9330001) — confirm it now routes to DOCUMENT_FAILED not assessment_complete
- [ ] DRA-P6-4: Checkpoint

## Pipeline Crash Resilience — Always-Complete Guarantee

- [ ] RESILIENCE-1: Fix NapiCanvasFactory null canvas crash in pdf-image-extractor.ts (Stage 1 scanned PDF crash) [DONE in code, not checkpointed]
- [ ] RESILIENCE-2: Add process.on('uncaughtException') + process.on('unhandledRejection') safety net in triggerAiAssessment that writes terminal DB state before process exit
- [ ] RESILIENCE-3: Wrap entire orchestrator call in db.ts with guaranteed finally block that always writes terminal state
- [ ] RESILIENCE-4: Fix Document Health Gate isDocumentIngested logic (incidentDate/description are pipeline outputs, not pre-conditions) [DONE]
- [ ] RESILIENCE-5: Fix gate cache_rehydration path (synthesise quality data when photos are cached) [DONE]
- [ ] RESILIENCE-6: Methodist claim (9330001) completes to analysis_complete end-to-end

## Photo-Evidence Enhancement Track — Remaining Polish (2026-07-15)

- [x] VISION-NORMALISATION: Implemented server/services/visionTermNormaliser.ts — normalises Wing→Fender at all 3 detectedComponents assignment points in Stage 6. 23/23 tests pass. Backfilled enrichedPhotosJson on 14 assessments AND damagedComponentsJson on 13 assessments (13/14 were contaminated — not a small number). Post-backfill: detectedComponents Wing terms=NONE ✅, damagedComponentsJson Wing terms=NONE ✅. Caption field retains old text (not consumed by any UI consumer — confirmed). VOLTRON: 📷×7 for Fender confirmed. Regex safety confirmed: only LH/RH Front Wing appeared in corpus — no Wing Mirror or other compound terms.
- [x] VISION-NORMALISATION: Full systematic scan completed across all 31 enriched-photo claims and 30+ real quote line items. Only Wing/Fender is a systematic mismatch. All other UK terms (Bonnet, Windscreen, Boot Lid, Sill, Tyre) also appear in real submitted documents and require no change.
- [ ] COVERAGE-AUDIT: "Zones Covered: 1" in Section 4.1 audit table for VOLTRON is correct but may confuse adjusters. Consider adding "(pre-zone-tagging)" note when zone count = 1 and enrichedPhotosJson exists.

---

## Report Realignment — July 2026 (Active)

- [ ] Rewrite forensicDecisionReport.ts to match original PDF section order exactly (cover → decision page → vehicle/policy → incident facts → physics → damage zone → cost summary → repair analysis → fraud → quality → definitions)
- [ ] Update Claims Processor queue dropdown (ClaimsProcessorDashboard.tsx) to use the new report generators
- [ ] Re-test both reports against LIVE-RUN-VOLTRON-001 after forensic realignment
- [ ] Update kinga-reports.test.ts to reflect the corrected forensic section structure
