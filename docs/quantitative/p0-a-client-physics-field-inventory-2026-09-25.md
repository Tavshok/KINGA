# P0-A-Client Inventory: Browser Collision-Physics Field Consumers

**Prepared:** 2026-09-25
**Status:** Read-only inventory. No implementation is authorized by this document, and no source file was modified to produce it.
**Baseline:** branch `claude/kinga-physics-fields-inventory-b1lama` at `45010c9`.
**Scope:** every `.ts`/`.tsx` file under `client/src`.

## Erratum (added 2026-09-25, after the P0-B1-Client verification)

The reachability test in this document counted any `import` statement as use. A second walk with the TypeScript compiler, which counts an import only when its binding is actually used (method in `p0-b1-client-inventory-verification-2026-09-25.md`), shows that the following files and code are **dead**. They are imported without being rendered or called, or they are never referenced at all:

- **Files:** `ForensicDecisionPanel.tsx`, `ImpactVectorDiagram.tsx`, `IntelligenceEnforcementPanel.tsx`, `Phase3ReportComponents.tsx`, `ClaimDecisionReport.sections.tsx`, and `AdvancedAnalyticsPanel.tsx` (listed in the adjacent-files table).
- **Code inside `InsurerComparisonView.tsx`:** `PhysicsValidationSection` (lines 1919–2491) is never rendered. That removes the browser crush-depth synthesis (2020–2034), the delta-V injury-risk classification (1945), and the path through `transformPhysicsAnalysisToValidation` (1820–1915) to its approve/review/reject recommendation. `PhysicsConfidenceDashboard` is rendered only from that dead function. `generateComparisonPDF` (`pdfExport.comparison.ts`) is imported but never called.

The live physics findings still stand. They are the `AssessmentResults` fabrications and the `ExecutiveSummary` verdict, the `useVisualDataGuard` → `VehicleImpactVectorDiagram` fallbacks (through `AssessmentResults`), the `ClaimDecisionReport.page` snapshot persistence and `PhysicsAnalysisChart`, `pdfExport.damage`, `KingaClaimsReport`, and the Package C displays that are not listed above. The two cross-cutting findings about invented values and decision drivers should be read with the dead items above removed. The recommendation below overstates the live exposure accordingly.

## Recommendation

The browser is not covered by P0-A or P0-A-2. No file under `client/src` references the P0 contract, `crush_depth_m` eligibility, or any physics hold or withheld marker. On the server, only the report renderers, `pdf-export.ts`, and `report-narrative-generator.ts` call `redactCollisionPhysics`. No tRPC read path does. Every browser consumer listed below therefore gets raw physics values from `aiAssessment.physicsAnalysis`, `enforcement.physicsEstimate`, `_physics`, or police-report records.

The most serious finding contradicts the P0-A premise directly. **The browser creates collision-physics values that no source supplied.** `InsurerComparisonView.tsx` creates a crush depth of 0.08–0.40 m from component severity labels. It then calculates impact force and impact speed from that crush depth, an assumed 1,200 kg mass, and an 800 kN/m stiffness. `AssessmentResults.tsx` fills in 45 km/h, 80 kN, 65 kJ, 4.5 g, a physics score of 70, and `is_valid: true` when fields are missing. `useVisualDataGuard.ts` fills in a delta-V of 30 km/h and a force of 15 kN. Some of these invented values then produce a claim verdict or an approve/review/reject recommendation.

P0-A-Client should be scoped like P0-B1-Client. That means server-issued allowlisted physics view models and the shared A2 physics hold in the browser. It also means removing every client fallback or synthesis path, and replacing the artifact and snapshot inputs.

## Authoritative field list used

`server/evidence-governance/quantitativeFieldGovernance.ts` (contract `P0-1.0`) defines the governed physical keys `crush_depth_m`, `speed_kmh`, `impact_force_kn`, and `kinetic_energy_j`. P0-A activates only the `crush_depth_m` adapter, and that adapter is never GOVERNING. The canonical explanation `P0_ADVISORY_RAW_STAGE6_ONLY` states that advisory crush depth "cannot supply governing crush, force, energy, speed, delta-V, fraud, cost, confidence, or learning input." The snake_case contract keys do not appear anywhere in `client/src`.

The client search therefore used the camelCase field family that P0-A-2 enforces in `server/reporting/p0PhysicsPresentation.ts` (`COLLISION_PHYSICS_FIELD`, `COLLISION_PHYSICS_BRANCH`, and the prose pattern). It also included the names requested for this audit and the variants actually found in the client: `estimatedSpeedKmh`, `deltaVKmh`, `impactForceKn`, `calculatedImpactForceKN`, `energyKj`, `kineticEnergyJ`, `decelerationG`, `brakingDistanceM`, `estimatedVelocityKmh`, `velocityRangeKmh`, `speedDiscrepancy`, `speedDeviation`, `impossibleDamagePatterns`, `maxCrushDepth`, `crushDepthCm`, and `crushEnergyJoules`.

These requested names have **zero** matches in `client/src`: `collisionForce`, `collisionSpeed`, `decelerationRate`, `physicalImpossibility`, `crushDepth` as a bare field, `delta_v` as a data field (it appears only in a comment), `crush_depth_m`, `speed_kmh`, `impact_force_kn`, and `kinetic_energy_j`.

## Reconciled file count

The broad pattern matched **36 files**. **Ten are false positives**, where "speed", "impossible", or "crush" is unrelated to collision physics. **Two contain physics fields but are not reached** from `client/src/main.tsx` (checked with a static import-graph walk that resolves the `@/` alias). The active scope is therefore **24 reachable files**. Five more reachable files use qualitative A2 conclusion keys (`causalVerdict`, `impactDirection`, `hiddenDamage`, `damageConsistency`) but none of the quantitative fields. They are listed separately.

| Category                                                    | Reachable files | Character of risk                                                                                                                                  | Suggested package |
| ----------------------------------------------------------- | --------------: | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Browser calculation, fabrication, and decision authority    |               5 | The client invents or derives physics values and turns them into a verdict, recommendation, injury-risk class, or persisted snapshot               | P0-A-Client A     |
| Report, print, PDF, and artifact inputs                     |               5 | Raw or invented physics values become user-created PDFs or printable report sections                                                               | P0-A-Client B     |
| Presentation, local classification, and triage              |              11 | Raw values are shown with locally computed severity bands, thresholds, colours, or guidance ("structural damage likely", "High fraud risk")       | P0-A-Client C     |
| Type-only, unused-field, or input capture                   |               3 | No runtime disclosure, but permissive types or a governed-source input path                                                                        | Fold into A/B     |
| Unreached physics-field files                               |               2 | No current browser path, but they would re-open disclosure if imported                                                                             | Gated backlog     |
| Adjacent qualitative A2 conclusion files                    |               5 | These show A2-redacted conclusions, not quantitative fields                                                                                        | Owner decision    |
| False positives                                             |              10 | Not collision physics                                                                                                                              | None              |

## P0-A-Client A — Browser calculation, fabrication, and decision authority

| File | Lines | What it does with the field | Use |
| ---- | ----- | --------------------------- | --- |
| `pages/InsurerComparisonView.tsx` | 2020–2034 | When no physics exists for a collision, it **creates `maxCrushDepth`** (0.40/0.25/0.15/0.08 m, keyed to the worst component severity). It then calculates `forceMagnitude = 800 kN/m × crush`, `speedMs = √(2·F·crush / 1200 kg)`, and `speedKmh`, and builds `_raw.estimatedSpeed` (confidence 55, CI ±30 %) and `_raw.impactForce`. | **Calculation / fabrication** |
| `pages/InsurerComparisonView.tsx` | 1928–1968 | It normalises pipeline-v2 physics. `speedKmh = estimatedSpeedKmh \|\| deltaVKmh` treats delta-V as a substitute for speed. Force falls back to `speedKmh × 80` N when absent, and `kineticEnergy`/`deltaV` are copied across. **`injuryRisk` is classified locally from `deltaV` (>40 high, >25 moderate).** `consistencyScore` defaults to 50. | **Calculation / classification** |
| `pages/InsurerComparisonView.tsx` | 1820–1914 | `transformPhysicsAnalysisToValidation`: it builds `speedConsistency` and `impactForceAnalysis` from `estimatedSpeed.confidence`/`impactForce.confidence`, which default to 75 and 85. It averages these into `overallConfidence` and **derives `recommendation: approve / review / reject`** at thresholds of 85 and 70. `impossibleDamagePatterns` becomes error anomalies, and the narrative includes `estimatedSpeed.value`. | **Decision** |
| `pages/InsurerComparisonView.tsx` | 2468–2469 | It gives each quote an "issues" badge when `impossibleDamagePatterns` is non-empty. | Decision-steering |
| `pages/InsurerComparisonView.tsx` | 386–387 | It copies raw `impactForce` and `estimatedSpeed` (default 0) into the export object passed to `generateComparisonPDF` / `generateDamageReportPDF`. | Artifact input |
| `pages/InsurerComparisonView.tsx` | 2050–2127, 2169–2236 | It shows velocity with its range and method ("Campbell's formula" by default), force in kN and N, Δt, `kineticEnergy` (kJ/J), and `deltaV`. It passes speed and force to `VehicleImpactVectorDiagram`, maps `consistencyScore` to `consistent/questionable/impossible`, and shows a force bar with "× vehicle weight". | Display (including invented values) |
| `pages/AssessmentResults.tsx` | 634–647 | It normalises `physicsAnalysis` with **hard-coded defaults**: `impactSpeed ?? 45`, `impactForce ?? 80`, `energyDissipated ?? 65`, `deceleration ?? 4.5`, `physicsScore ?? 70`, `confidence ?? 0.7`, `is_valid ?? true`, and `damageConsistency` defaulting to `'consistent'`. | **Fabrication** |
| `pages/AssessmentResults.tsx` | 783, 837–840 | It passes the invented `physicsData` to `ExecutiveSummary` (verdict) and shows a pass/warn/fail physics bar at 70 and 40. | **Decision input** |
| `pages/AssessmentResults.tsx` | 651–657 | It builds `physicsValidation.calculatedImpactForceKN` (default 0) for the diagram. | Display input |
| `pages/AssessmentResults.tsx` | 1043–1079 | Pass/warning/fail status and narrative ("forces of approximately X kN"; "shouldn't produce the observed damage"). It lists speed, force, energy (shown as "%"), and g-force, and passes speed and force to `VehicleImpactVectorDiagram`. | Display + conclusion |
| `components/ExecutiveSummary.tsx` | 19–20, 84–118, 144 | `PhysicsData.impactSpeed`/`impactForce`. `getOverallVerdict` weights `physicsScore` at 30 % toward **"CLAIM APPEARS LEGITIMATE / REQUIRES FURTHER REVIEW / SIGNIFICANT CONCERNS"**. | **Decision** |
| `components/ExecutiveSummary.tsx` | 342–345 | Key-findings narrative: "at an estimated X km/h with Y kN impact force is **physically consistent** with the observed damage", branching on `is_valid`. | Conclusion text |
| `hooks/useVisualDataGuard.ts` | 99–101, 111, 130–173 | `usePhysicsDiagramGuard`: when `deltaV` is missing it substitutes **`FALLBACK_DELTA_V = 30` km/h**, and when `impactForce` is missing it substitutes **`FALLBACK_FORCE = 15` kN**. It returns `resolvedDeltaV` and `resolvedImpactForce`, marked only as "Estimated from available data". | **Fabrication** |
| `pages/ClaimDecisionReport.page.tsx` | 142, 339–404 | On first render it calls **`trpc.aiAssessments.saveSnapshot`** with `physics: { deltaV, velocityRange, energyKj, forceKn }` from `enforcement.physicsEstimate` (defaulting to 0 / "Not calculated"). The raw physics values are persisted from the browser. | **Persistence / egress** |
| `pages/ClaimDecisionReport.page.tsx` | 680–708 | `impactSpeed = pe.estimatedVelocityKmh ?? physicsRaw.deltaVKmh ?? physicsRaw.deltaV` falls back from speed to delta-V. It passes speed, force, energy, and deceleration to `PhysicsAnalysisChart`. `damageConsistency` **defaults to `"questionable"`**. | Display + default conclusion |
| `pages/ClaimDecisionReport.page.tsx` | 597–620 | "Data Integrity Alert — N Logical Impossibilities" banner, built from the server's `enforcement._impossibilityFlags`. | Display |

## P0-A-Client B — Report, print, PDF, and artifact inputs

| File | Lines | What it does with the field | Use |
| ---- | ----- | --------------------------- | --- |
| `lib/pdfExport.comparison.ts` | 285–293 | It writes police `reportedSpeed` and a "⚠ Speed Discrepancy: N km/h" line into the PDF. | Artifact |
| `lib/pdfExport.comparison.ts` | 415–420, 463–464 | It calculates `impactForceKN` (converting `_raw.impactForce.magnitude` from N to kN) and `speedKmh`, and writes "Estimated Impact Force" / "Estimated Speed at Impact" when the value is > 0. | Artifact (small calculation) |
| `lib/pdfExport.comparison.ts` | 437, 443 | It adds `impossibleDamagePatterns` to the PDF fraud-indicator list as "Impossible pattern: …". | Artifact |
| `lib/pdfExport.damage.ts` | 282–287, 304–305 | Same force/speed resolution and PDF lines as the comparison export. | Artifact |
| `components/KingaClaimsReport.tsx` | 1166–1167 | Report row labelled **"ΔV (Impact Speed)"** from `_physics.deltaVKmh`. The label presents delta-V as impact speed. | Report display |
| `pages/ClaimDecisionReport.sections.tsx` | 69–75, 464–487 | `WhatHappened`: a narrative sentence "sustained a … collision at estimated X km/h (range …)" from `physicsEstimate`. | Report narrative |
| `pages/ClaimDecisionReport.sections.tsx` | 919–959 | `CollapsibleTechnicalData`: impact speed, delta-V, force, and energy. It falls back from `physicsEstimate` to raw `physicsAnalysis` (`deltaVKmh ?? deltaV`, `impactForceKn`, `energyDissipatedKj`, `estimatedSpeedKmh`). | Report display |
| `components/Phase3ReportComponents.tsx` | 461, 471, 500 | `PhysicsConsistencyGauge`: `deltaV = physicsEstimate.deltaVKmh ?? estimatedVelocityKmh ?? 0`, so speed is treated as delta-V. It prints "Delta-V: X km/h" next to the consistency score. | Report display |

## P0-A-Client C — Presentation, local classification, and triage

| File | Lines | What it does with the field | Use |
| ---- | ----- | --------------------------- | --- |
| `components/ForensicDecisionPanel.tsx` | 266–276 | Parses raw `physicsAnalysis`: `estimatedSpeedKmh`, `deltaVKmh`, `impactForceKn` (dividing by 1000 when `impactVector.magnitude` > 1000), `energyKj`, `kineticEnergyJ`, `decelerationG`, and `brakingDistanceM`. **`brakingMu` defaults to 0.7.** `severityBand(estimatedSpeedKmh)` is computed but never read. | Local derivation |
| `components/ForensicDecisionPanel.tsx` | 337, 348 | Integrity flag when physics is not executed. Narrative: "collision at an estimated X km/h, dissipating Y kJ". | Display / narrative |
| `components/ForensicDecisionPanel.tsx` | 1185–1240 | Passes the values to `ImpactVectorDiagram`. Calculates **energy-absorption % = energyKj·1000 / kineticEnergyJ**, g → m/s², and a **surface class from μ** (dry/wet/loose) that relies on the 0.7 default. | Display + local calculation |
| `components/ImpactVectorDiagram.tsx` | 16–19, 47, 67–70, 96, 123, 141, 248–305 | Takes speed, delta-V, force, and energy. `severityFromSpeed` bands the speed. Arrow length and stroke scale with force. Badges and a table show the values with highlights at speed > 60, ΔV > 30, force > 50, and energy > 100. | Display + local classification |
| `components/ImpactVectorDiagram.tsx` | 328–341 | **Guidance from speed alone:** > 80 km/h shows "High-energy impact, structural damage likely"; > 40 km/h shows "check structural components". | Decision-steering |
| `components/PhysicsAnalysisChart.tsx` | 6–10, 72–111 | Speed, force, energy-dissipated, and deceleration cards. | Display |
| `components/PhysicsAnalysisChart.tsx` | 23, 171–172 | When `damageConsistency === 'impossible'`: "Damage pattern is **physically impossible** … **High fraud risk detected**." | Conclusion (physics → fraud) |
| `components/VehicleImpactVectorDiagram.tsx` | 13, 25–26, 43–44, 66–74 | `calculatedImpactForceKN` sets the arrow length (2 px/kN, clamped); legacy `impactSpeed`/`impactForce` props. | Display scaling |
| `components/VehicleImpactVectorDiagram.tsx` | 202–220, 294–305 | Uses `usePhysicsDiagramGuard`. `displaySpeed = resolvedDeltaV`, so the **invented 30 km/h appears as "Impact Speed"** with the caption "Speed estimated from typical impact". Force falls back to the invented 15 kN for the vector. | Display of invented value |
| `components/VehicleImpactVectorDiagram.tsx` | 29, 242, 501 | Badge and alert styling for `damageConsistency: 'impossible'`. | Display |
| `components/IntelligenceEnforcementPanel.tsx` | 21–25, 240–256 | Shows `physicsEstimate` estimated velocity with its range, force range, energy range, and delta-V. | Display |
| `components/PhysicsConfidenceDashboard.tsx` | 8–10, 117–142 | Shows `speedConsistency` and `impactForceAnalysis` percentages with colour bands. These values come from the 75/85 defaults in `InsurerComparisonView`. It also shows the **approve/review/reject recommendation** at line 40. | Display of derived decision |
| `pages/InternalAssessorDashboard.tsx` | 338 | Assessor work-queue card shows "Physics ΔV: X km/h" from `_physics.deltaVKmh`. | Display (triage surface) |
| `pages/AssessorClaimDetails.tsx` | 395–397 | Shows cross-validation `speedDeviation` %. (Lines 238/249, "Temporal Impossibility", concern dates, not physics, and are out of scope.) | Display |
| `pages/admin/PhysicsAccuracyDashboard.tsx` | 151–153, 328–376, 410–413 | Admin telemetry: speed MAPE, predicted speed with low/high CI, actual speed, and `speedDeviationPct`, coloured at 15/30 %. This is the known M14 surface. | Display (telemetry) |
| `pages/FraudAnalyticsDashboard.tsx` | 111–178, 516, 523–528, 562–617 | "Momentum Violation Trends", "Speed Estimation Discrepancies", and "Impossible Rollover" figures are **invented as fixed fractions of `highRiskClaims`/`totalClaims`** and are not measured. `physicsDetections` counts claims whose `fraudFlags` contain "speed"/"impact". Lines 105 and 352 are descriptive text only. | Display of invented aggregates |
| `components/PoliceReportForm.tsx` | 28, 69, 269–274 | Captures the **documentary** reported speed from the police report (a user input sent to `policeReports.create`). | Input capture |
| `components/PoliceReportForm.tsx` | 41–42, 115–116, 132–184 | Shows the server-computed `speedDiscrepancy`. **Client thresholds of 10, 20, and 30 km/h** control severity colouring and a toast that says "This has been flagged for fraud investigation". | Display + local classification |

## Type-only, unused-field, and input-capture files

| File | Lines | What it does with the field | Use |
| ---- | ----- | --------------------------- | --- |
| `lib/pdfExport.shared.ts` | 144, 147, 226 | Permissive PDF input types (`reportedSpeed`, `speedDiscrepancy`) and a doc comment about the legacy flat physics format. | Type only |
| `components/VehicleDamageVisualization.tsx` | 12 | `calculatedImpactForceKN` is declared on the prop interface. The component reads only `impactAngleDegrees` (lines 126–127). | Type only (unused) |
| `pages/EngineerInspectionDetail.tsx` | 38, 387 | The engineer-measurement form offers a `vehicle_crush` category and a `front_crush_depth` placeholder. This is a human-entered measurement (the contract's `HUMAN_VERIFIED_MEASUREMENT` vocabulary), not a consumer. | Input capture |

## Unreached physics-field files

| File | Lines | What it does with the field |
| ---- | ----- | --------------------------- |
| `components/AIAssessmentPanel.tsx` | 184, 194–198, 227–228 | Shows force and estimated speed (defaulting to 0) and "Impossible: …" patterns. It sets `hasFlags` from `impossibleDamagePatterns`. |
| `components/VehicleImpactVectorDiagramQuantitative.tsx` | 12–17, 38–60, 208–214, 290–301, 422 | Types for `impactSpeedKmh`, `deltaV`, `estimatedImpactForceKN`, `crushDepthCm`, and `crushEnergyJoules`. It shows speed and force ("≈ tons"), draws deformation arrows when force > 30 kN, and falls back to `useVectorDiagramGuard`. |

## Adjacent qualitative A2 conclusion files (not quantitative)

| File | Lines | What it does |
| ---- | ----- | ------------ |
| `components/AdvancedAnalyticsPanel.tsx` | 566–590 | Parses `causalVerdictJson` and shows it through `CausalVerdictSection`. |
| `components/IncidentTypeOverrideDialog.tsx` | 62, 262–263 | Shows the revalidation result for `impactDirection` with inconsistent zones. |
| `components/FraudRiskRadarChart.tsx` | 7, 43 | Plots `damageConsistency` as a fraud-radar axis. |
| `components/ClaimIntelligenceHeader.tsx` | 46, 242–252 | Shows the CGI `hiddenDamageProbabilityOverride` as a "% hidden damage probability" alert when it is > 0.4. |
| `pages/admin/PipelineHealthDashboard.tsx` | 73 | Pipeline stage label "Hidden Damage". |

## False positives (excluded)

`AssessorPortalLayout.tsx:44`, `AssessorPerformance.tsx:322`, `AssessorLeaderboard.tsx:71`, and `OperationalHealthDashboard.tsx:309` use "speed" to mean turnaround time. `demoData.ts:93,158,202` is the "Speedfix" name and demo text. `deprecated/Batch1ReportComponents.tsx:687,697` and `deprecated/Batch2ReportComponents.tsx:304` are static text. `InsurerExternalAssessmentUpload.tsx:92`, `ConfidenceImprovementChecklist.tsx:272`, and `VehicleStructuralIntelligencePanel.tsx:175` are static help or marketing strings.

## Cross-cutting findings

1. **No browser boundary exists.** None of the 24 files can show an advisory or unavailable state for collision physics. A2's hold and redactor are applied only when the server renders a document.
2. **Values are invented in the browser.** The sources are: crush depth from severity labels (`InsurerComparisonView` 2020–2034); 45 km/h, 80 kN, 65 kJ, 4.5 g, score 70, and valid (`AssessmentResults` 634–647); 30 km/h and 15 kN (`useVisualDataGuard` 130–162); force = speed × 80 N (`InsurerComparisonView` 1956); confidences 75 and 85 (`InsurerComparisonView` 1829–1837); μ = 0.7 (`ForensicDecisionPanel` 273); and a `"questionable"` consistency default (`ClaimDecisionReport.page` 708). Under P0-A, visual crush geometry is advisory at best, and none of these values have any source at all.
3. **Physics drives client decisions.** These are the verdict (`ExecutiveSummary`), approve/review/reject (`InsurerComparisonView` → `PhysicsConfidenceDashboard`), injury-risk class, structural guidance (`ImpactVectorDiagram`), "High fraud risk" (`PhysicsAnalysisChart`), the fraud-investigation toast (`PoliceReportForm`), and the per-quote issue badge.
4. **Browser egress.** The browser persists physics values through the `aiAssessments.saveSnapshot` mutation and writes them into two jsPDF generators.
5. **Speed and delta-V are conflated.** `KingaClaimsReport` labels ΔV as "Impact Speed". `Phase3ReportComponents` and `ClaimDecisionReport.page` fall back from each quantity to the other, and `InsurerComparisonView` uses `estimatedSpeedKmh || deltaVKmh`.

## Explicit exclusions

This inventory does not authorize implementation, a P0-A-Client package, server DTO changes, or remediation of the unreached files. It is a static source scan. Dynamic imports built from runtime strings would not be detected, and server-side read models were checked only far enough to confirm that no tRPC path applies `redactCollisionPhysics`.
