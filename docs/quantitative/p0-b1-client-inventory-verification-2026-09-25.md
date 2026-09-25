# P0-B1-Client Inventory: Independent Verification

**Prepared:** 2026-09-25
**Status:** Read-only verification. No source file was modified, and this document authorizes no implementation.
**Verified document:** `docs/quantitative/p0-b1-client-scope-estimate-2026-09-23.md` (baseline `063c6fc`).
**Verification baseline:** `45010c9`, which includes `main` through PR #153. Between the two baselines `client/src` changed in only two files, `ClaimReviewDialog.tsx` and `ExecutiveDashboard.tsx` (the approved containment). Counts were also re-run at `063c6fc` so the comparison is like for like.

## Summary

The field-level findings in the scope estimate are correct where they can be checked. Every A-package behaviour it names was confirmed in the source, and the reachable-file count is reproduced almost exactly. However, the estimate's reachability test counted files that are imported but never rendered as runtime consumers, and it missed a group of live fraud consumers that do not use the exact field names it searched for.

1. **The companion inventory cannot be checked.** The scope estimate says the 26 Package C files and the 13 unreached files are "preserved in the companion inventory". No such file exists anywhere in the repository. Only 25 of the 64 files are named. The C and unreached lists can only be checked by count.
2. **The count reproduces, but the method overstates reachability.** A simple import-graph walk over the direct fraud fields gives **51 reachable and 12 unreached** at `063c6fc`, against Manus's 51 and 13. That walk treats any `import` statement as use. A walk with the TypeScript compiler that counts an import only when its binding is actually used gives **45 live and 20 dead** at the same commit, and 44 live and 20 dead at HEAD.
3. **Two named B-package files are dead:** `ForensicCharts.tsx` and `Phase3ReportComponents.tsx`. The type/doc file `labelUtils.ts` is also dead. Two more B files are reachable only through a barrel re-export, and their exported function is never called from live code: `pdfExport.comparison.ts` and `pdfExport.claimSummary.ts`.
4. **Most of `InsurerComparisonView.tsx`'s fraud logic is dead code.** Its fraud-indicator, recommendation, and "Outcome" logic sits in two functions that are never rendered, and in a `pdfData` object that is built and then discarded.
5. **At least 11 live files with real fraud data are outside the direct-field pattern.** They use `alerts`, `vehicleRiskScore`, `fraudMarkersScore`, `overallRisk`, `fraudSuspected`, `fraudSensitivityMultiplier`, and similar keys. The server's own P0-B1 redactor (`FRAUD_FIELD` in `server/reporting/p0FraudPresentation.ts`) would redact most of these keys. The estimate does not name any of these files. Because its C list is not available, it cannot be confirmed whether they were included.
6. **Two decision paths are under-classified.** `ExecutiveSummary.tsx` produces a claim verdict ("CLAIM APPEARS LEGITIMATE") that is 30 % weighted on fraud risk. `AssessmentResults.tsx` feeds it an invented fraud score of 20 when none exists. The estimate puts `AssessmentResults` in Package B (artifacts) only.

## Authoritative field list

`quantitativeFieldGovernance.ts` lists only `fraud_risk_score` for fraud, and it has no active fraud adapter. `server/evidence-governance/p0FraudDecisionHold.ts` defines the hold contract (`FRAUD_DECISION_WITHHELD`) but no field list. The only executable fraud-field definition is the server redactor:

```
FRAUD_FIELD = /^(?:fraud(?:_|[A-Z])|risk(?:Score|Level|Class|Rating|Category|Flag|Indicators)?$|overallRisk(?:Level)?$|highRisk$|isHighRisk$|fraudRiskEvaluation$)/
```

That regex also matches local variable names such as `fraudColor`, and hold consumers such as `fraudDecisionHold`, so it is too broad for a file count. This verification therefore used two tiers:

- **Tier 1 (direct stored fields).** `fraudScore`, `fraudRiskScore`, `fraudRiskLevel`, `fraudFlags`, `fraudIndicators`, `fraudScoreBreakdownJson`, `fraudLevel`, `fraudLevelEnforced`, `fraudRisk`, `highRisk`, `isHighRisk`, `high_fraud`, `fraud_risk_score`, and `fraud_risk_level`. This is the closest reproduction of Manus's "exact direct-field match".
- **Tier 2 (the rest of the `FRAUD_FIELD` family).** Each file was triaged by hand to separate real fraud data from local names and hold consumers.

## How reachability was measured

The compiler-based walk starts at `client/src/main.tsx` and resolves the `@/` alias. It follows `export … from` re-exports and dynamic `import()` calls. An import counts only if at least one of its non-type bindings is used in the file. A `const X = lazy(() => import(…))` counts only if `X` is referenced again. Within live files, each hit line was also checked against its enclosing top-level function, to find functions that are defined but never referenced. Every "dead" verdict below was confirmed by hand with `grep`.

## Discrepancies against the named files

| Manus file | Manus category | Finding | Evidence |
| --- | --- | --- | --- |
| `components/ForensicCharts.tsx` | B (artifact) | **Dead** | Its only importer is `ForensicDecisionPanel.tsx:33`, which is itself dead (below). |
| `components/Phase3ReportComponents.tsx` | B (artifact) | **Dead** | `ClaimDecisionReport.page.tsx:36-42` imports six symbols but renders none of them (each appears once, in the import). The other importer, `ClaimDecisionReport.sections.tsx`, is dead. |
| `lib/labelUtils.ts` | Type/doc | **Dead** (and doc-only, as Manus said) | Imported only by `ForensicDecisionPanel.tsx` and `AdvancedAnalyticsPanel.tsx`, and both are dead. |
| `lib/pdfExport.comparison.ts` | B (artifact) | **Dead function** | `generateComparisonPDF` is imported at `InsurerComparisonView.tsx:19` but never called. The file is reachable only through the `pdfExport.ts` barrel. |
| `lib/pdfExport.claimSummary.ts` | B (artifact) | **Dead function** | The only caller of `generateClaimSummaryPDF` is `InsurerClaimsTriage.tsx:49`, and that page is never routed (below). |
| `pages/InsurerComparisonView.tsx` | A (authority) | **Live, but most fraud logic is dead** | `PhysicsValidationSection` (lines 1919–2491) and `ExecutiveSummaryInline` (2494–2603) are never rendered. That removes the fraud-indicator anomalies (1823–1914), the per-quote issue badge (2468), and the "Fraud Risk / Outcome" row (2517–2554). The `pdfData` object (727–893, carrying `fraudRisk` at 737 and 791–841) is built and never used, because the button calls `printActiveReport()` at 915. The live fraud paths are the fraud-level badge (531–632), the `ClaimApprovalToolbar` gate (1110), and the `generateDamageReportPDF` export (363, 386–387). |
| `pages/AssessmentResults.tsx` | B (artifact) | **Under-classified:** also decision | `fraudData.riskScore` defaults to **20** when absent (671) and feeds `ExecutiveSummary`, whose `getOverallVerdict` weights fraud at 30 % (`ExecutiveSummary.tsx:93-96`). |
| The other named A and B files, plus `pdfExport.shared.ts` | as stated | **Confirmed live** | Import chains are listed in the inventory below. |
| `ClaimReviewDialog.tsx`, `ExecutiveDashboard.tsx` | Containment | **Confirmed** | `ClaimReviewDialog` now reads only `fraudDecision` (the hold). `ExecutiveDashboard` keeps the `high_fraud` drill-down filter literal (227) and a `fraudPrevented` KPI (1158). The drill-down endpoint throws the hold server-side. |

## Files that are likely in Manus's unnamed C or unreached lists but are dead

Manus counted these files as reachable. Because the C list is missing, their inclusion in the 47 cannot be confirmed by name.

| File | Why it is dead |
| --- | --- |
| `components/ForensicDecisionPanel.tsx` | Imported at `InsurerComparisonView.tsx:30` and never rendered. It contains a browser **APPROVE/REVIEW/REJECT** verdict from `fraudScore > 60 / > 35` (59–80, 355, 378). The verdict would be A-class if the file were live. |
| `components/IntelligenceEnforcementPanel.tsx` | Imported at `InsurerComparisonView.tsx:28` and never rendered. |
| `components/AiIntelligenceSummaryCard.tsx` | Imported at `InsurerComparisonView.tsx:25` and never rendered. |
| `pages/ClaimDecisionReport.sections.tsx` | The page imports ten components (`ClaimDecisionReport.page.tsx:63-74`) and renders none. Only a type import (62) is used. |
| `pages/InsurerClaimsTriage.tsx` | Declared at `App.tsx:47` (`lazy`), but no `<Route>` renders it. |

The 12 files that nothing imports at all are `AIAssessmentPanel`, `AiReanalysisPanel`, `ClaimCard`, `DecisionNarrativeView`, `EscalationCentre`, `OperationalFraudQueue`, `ReportComponents`, `ReportReadinessPanel`, `RiskRadarWidget`, `deprecated/Batch1ReportComponents`, `deprecated/Batch2ReportComponents`, and `lib/demoData`. Manus reports 13 unreached. The difference is not identifiable without the companion list.

## Live Tier-1 inventory at HEAD (44 files)

### Decision, mutation, or persistence (10)

| File | Lines | What it does | Named by Manus |
| --- | --- | --- | --- |
| `components/ClaimApprovalToolbar.tsx` | 178, 531–574 | When `fraudScore >= 70` it disables Approve and requires a written override justification. It shows the score in the banner and dialog. Live through `InsurerComparisonView.tsx:1110`. | A ✓ |
| `components/DecisionAuthorityPanel.tsx` | 225, 414–480 | Sends `fraud_result { fraud_risk_level, fraud_risk_score }` from the browser into `contradictionMutation` and `decisionMutation`. | A ✓ |
| `pages/ClaimDecisionReport.page.tsx` | 373–374, 724, 737–738 | **Persists** `fraud { score, level, contributions }` through `aiAssessments.saveSnapshot`. Passes the raw level and score to `ClaimsExplanationPanel` and `DecisionAuthorityPanel`. | A ✓ |
| `components/ClaimsExplanationPanel.tsx` | 27, 88–98 | Sends the browser-supplied `fraud_risk_level` to `decision.generateClaimExplanation`, so the server generates narrative from client-supplied fraud input. | **Not named** |
| `pages/RiskManagerDashboard.tsx` | 166, 172, 353–363, 418–704 | **Client fallback escalation queue:** `fraudRiskScore >= 70` or level `high`. Also a risk average, alert counts, and 40/70 tiering. | A ✓ |
| `pages/InternalAssessorDashboard.tsx` | 233, 362–500, 156/776/900–902 | The assessor form **persists** a human `fraudRiskLevel` (406). Derives a high/medium/low level from the raw score (233). Shows `RiskBadge` in queues. | A ✓ |
| `pages/AssessorClaimDetails.tsx` | 56, 105, 415–432, 622–627, 764 | `createReportDraft` **persists** the assessor-entered `fraudRiskLevel`. Shows a "High/Medium Fraud Risk Detected" banner and indicators. | A ✓ |
| `components/ExecutiveSummary.tsx` | 84–118, 145, 395–414 | **Verdict:** fraud `riskScore` is 30 % of "CLAIM APPEARS LEGITIMATE / REQUIRES FURTHER REVIEW / SIGNIFICANT CONCERNS". Also a pass/warn/fail status and a list of `crossValidation.fraudIndicators`. | **Not in A** |
| `pages/AssessmentResults.tsx` | 134, 661–671, 846–849, 1093–1095 | **Invents defaults** (`riskScore` 20, indicators 2) and passes them to `ExecutiveSummary`. Shows a 30/60 risk bar and narrative. | B only |
| `pages/InsurerComparisonView.tsx` | 531–632, 1110, 363/386 | Fraud-level badge, toolbar gate, and damage-PDF export. See the dead-code notes above. | A ✓ |

### Report, print, and export artifacts (9)

| File | Lines | What it does | Named |
| --- | --- | --- | --- |
| `components/Batch3ReportComponents.tsx` | 41–82, 131–149, 342–360 | Puts `fraudScore` into the **integrity-seal hash** input and the report header. | B ✓ |
| `components/KingaClaimsReport.tsx` | 460, 499–500, 735, 771, 1110–1116, 1205 | Printable report. Labels the score HIGH/MODERATE/LOW at 70/40 and shows a badge, bar, and narrative. | B ✓ |
| `lib/export-excel.ts` | 17, 39–43 | XLSX export with "Fraud Risk Score" and a HIGH/MEDIUM/LOW column derived at 70/40. Called from `ClaimsManagerDashboard.tsx:372`. | B ✓ |
| `lib/exportUtils.ts` | 150–160 | Executive PDF table "High Fraud Risk Claims". `fraudRiskLevel` **defaults to "High"**. | B ✓ |
| `lib/fleetReportExport.ts` | 17, 68 | Fleet HTML report shows `highRisk` and `riskScore/100`. | B ✓ |
| `lib/pdfExport.damage.ts` | 348–351 | Writes `fraudRiskScore` and `fraudIndicators` into the damage PDF. Called from `InsurerComparisonView.tsx:363` and `BatchExport.tsx:169`. | B ✓ |
| `pages/InteractiveReport.tsx` | 140–143, 276–293 | Shows `fraudRisk.overallRiskLevel`, `riskScore`, explanation, and indicators. | B ✓ |
| `pages/ReportsCentre.tsx` | 957 | Shows the report-list fraud percentage. | B ✓ |
| `pages/PlatformClaimTrace.tsx` | 210 | Shows the extracted `fraudRiskScore`. | B ✓ |

### Presentation, triage, and local classification (21)

`ClaimDrillDownModal` (90–91; the server holds its endpoint, but the rendering code remains), `ClaimRiskIndicators` (35–66, 349–350; `RiskBadge`/`RiskDot` thresholds and parsed flags), `ConfidenceImprovementChecklist` (49, 113–127, 279–286; `fraudScore >= 40` makes an item "CRITICAL" and adds evidence guidance), `CrossValidationPanel` (44, 276–283), `FraudScorePanel` (225–265), `GovernanceIndicators` (25–70), `executive/ExecutiveEscalationQueue` (97), `replay/ReplayComparisonView` (47, 231–232), `AdminDashboard` (134, 499; high-risk counts), `AssessorDashboard` (68/88, 317–342, 599–601; local high/moderate/low), `AssessorPerformanceDashboard` (268), `ClaimsManagerComparisonView` (226–501; meter, banner, governance props), `ClaimsProcessorDashboard` (713–716; 40/70 badge), `ExternalAssessorDashboard` (176–183; 40/70 colour), `FleetManagement` (690; high-risk vehicle filter), `FraudAnalyticsDashboard` (442–552; `> 70` list filter, tiering, and cost by risk tier), `InsurerDashboard` (37; high-level count), `InsurerQuoteComparison` (78–203; flag list), `RiskManagerAnalytics` (215–227, 832; fraud-rate-by-level chart), `VehicleRegistry` (548–552; score `> 25` badge), and `admin/PipelineHealthDashboard` (107, 809).

Manus's C list is not available, so none of these can be matched by name. `FraudScorePanel`, `FraudAnalyticsDashboard`, `RiskManagerAnalytics`, and `ClaimDrillDownModal` also appear in Manus's earlier combined inventory (M12, M13) and the containment record.

### Containment, type-only, and dead-function files (4)

`ExecutiveDashboard.tsx` (containment; residual filter literal and KPI), `pdfExport.shared.ts` (types only), `pdfExport.comparison.ts` (dead function), and `pdfExport.claimSummary.ts` (dead function).

## Live Tier-2 fraud consumers outside the direct-field pattern

These files are live, but none of Manus's named direct fields match them. Each carries real fraud or fraud-derived risk data.

| File | Lines | What it does | Server state checked |
| --- | --- | --- | --- |
| `components/VehiclePassportPanel.tsx` | 113–254 | `vehiclePassport.getFraudSignals` returns raw `fraud_alerts` rows (type, severity, description). The panel shows alert and signal counts and the top three of each. | `server/routers/vehicle-passport.ts:504` has no hold and returns raw alerts. |
| `pages/KingaAgency.tsx` | 348–369, 398–428 | Shows `vehicleRiskScore` and the forensics `riskScore` (**defaulting to 50**), coloured at 70/40. The source also carries `hasSuspiciousDamagePattern`. | `agency.getVehicleRiskIntelligence` (`agency.ts:356-406`) and `getVehicleForensics` have no hold. |
| `components/QuoteComparisonView.tsx` | 47–49 | Colours the quote's `vehicleRiskScore` at 70/40. Rendered by `KingaAgency`. | Same source. |
| `components/FraudRiskRadarChart.tsx` | 7–43 | Fraud radar (`overallRisk`, `riskScore`, `damageConsistency`) rendered by `AssessmentResults`. | Client-derived. |
| `pages/ReviewQueue.tsx` | 258 | "Fraud Risk: `fraudMarkersScore`/100". | Not checked. |
| `pages/HistoricalClaimsPipeline.tsx` | 886–913, 1030 | Shows `fraudStats.suspected` counts. | Not checked. |
| `components/executive/PortfolioIntelligenceTab.tsx` | 202–204 | Fraud-alert-count KPI. | Not checked. |
| `pages/admin/EscalationQueue.tsx` | 94, 194, 399–466 | FRAUD_TEAM routing-queue counts and rates, and a `fraud_detected` flag. | Not checked. |
| `pages/admin/LearningDashboard.tsx` | 134–186 | `learning.getFraudPatternAnalysis` and calibration proposals that carry `fraud_adjustments`. | The procedure body (`learning.ts:151`) shows no hold in its first lines. |
| `components/policy/*` (4 files), `pages/PolicyManagementDashboard.tsx` | various | Reads and **writes** the automation-policy `fraudSensitivityMultiplier` (in `CreatePolicyForm`). This is the M28 owner-decision surface. | Not checked. |
| `components/ExecutiveAnalyticsCharts.tsx` | 131–135 | Queries `executive.getFraudDetectionTrends` and `getFraudRiskDistribution`. The server now throws the hold (`executive.ts:183-188`), but the client has no hold renderer and treats the failure as missing data. | Held on the server. |

These Tier-2 files were judged not to be fraud-data consumers:
- `ClaimsManagerDashboard` handles the hold correctly (checks `FRAUD_DECISION_WITHHELD`, line 209).
- `ClaimReviewDialog` is the containment hold consumer.
- `pdfExport.fraud.ts` is dead, because `generateFraudAnalyticsPDF` is only re-exported.
- `NotificationCentre`, `AuditLog`, `ActivityTimeline`, and `EscalationRoutingPanel` only show `fraud_detected` as an event-type label.
- `InsurerAdminDashboard` counts the `fraud_flagged` workflow status. That is a workflow status rather than a score, but it still acts as a fraud-derived queue and needs an owner decision.
- `ConfidenceScorePanel`, `ReportSectionThread`, `RepairIntelligencePanel`, `PhysicsConfidenceDashboard`, and `AssetPassport*` use risk keys that are not fraud values, or are asset-risk values.

## Recommended corrections to the P0-B1-Client scope

1. Commit the companion inventory, or regenerate it, so the C and unreached lists can be reviewed by name.
2. Move `ForensicCharts`, `Phase3ReportComponents`, `labelUtils`, `ForensicDecisionPanel`, `IntelligenceEnforcementPanel`, `AiIntelligenceSummaryCard`, `ClaimDecisionReport.sections`, and `InsurerClaimsTriage` to the gated dead backlog. Treat `pdfExport.comparison` and `pdfExport.claimSummary` the same way. Deleting the unused imports and functions is cheaper than governing them.
3. Add `ExecutiveSummary` and `ClaimsExplanationPanel` to Package A, and reclassify `AssessmentResults` as A+B.
4. Add the Tier-2 live consumers above to Package C, or to an owner-decision list for the policy and learning surfaces. `VehiclePassportPanel` and `KingaAgency` read unheld server endpoints.

## Audit limits

This is a static analysis. Routes gated by role are still counted as live. Dead-function detection covers only top-level declarations. "Not checked" in the server column means the server hold status was not verified. The Manus figures are compared by count wherever the companion list is missing.
