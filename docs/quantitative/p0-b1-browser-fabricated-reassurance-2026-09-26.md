# P0-B1 Browser Fabricated-Reassurance Containment

**Package:** B-R1 — fabricated reassurance browser containment  
**Date:** 2026-09-26  
**Branch:** `fix/p0-b1-browser-fabricated-reassurance`  
**Base:** `d9076b2b` — merged P0-B1 Client Runtime Authority Hardening, Group A  
**Status:** reviewed and merge-ready on the isolated test-repair stack

## Purpose

This package contains three live browser paths that converted a canonical P0-B1 fraud-decision hold into a reassuring, usable fraud result. The paths were re-derived from the current integration lineage after Group A merged and re-verified after scope correction.

The common rule is unchanged: a direct or nested `FRAUD_DECISION_WITHHELD` sentinel means that automated fraud scoring, risk classification, routing, certification, notification, persistence, and publication must not be inferred from missing fields. Browser code must render actionable manual-review guidance before any legacy fraud branch, default, threshold, or display can execute.

## Included paths

| Path                                                        | Pre-fix behavior                                                                                                                                                                                                                                                                                                                                                               | Containment                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/components/VehiclePassportPanel.tsx`            | The held `getFraudSignals` response omits totals. Both legacy comparisons evaluate false and the panel renders the green statement **“No fraud signals detected.”** The independent Passport response could also show a green `LOW RISK` badge, fraud-derived counts, a renewal-risk score whose inputs include cross-claim fraud signals, and `fraud_alert` timeline entries. | Detect the direct canonical hold before every fraud-derived presentation branch. The hold now suppresses the green no-signal state, header risk badge, repeat-zone/fraud-alert summary rows, renewal-risk score, and `fraud_alert`/`fraud_alerts` timeline entries while retaining unrelated timeline evidence. Pending, failed, or absent authority-query data takes the same shared manual-review path; it is never treated as an available zero-risk result. |
| `client/src/components/executive/ExecutiveAlertsCenter.tsx` | `getExecutiveAlerts` throws the canonical hold. The component mapped absent data to `[]`, then rendered **“All clear”** and **“No alerts at this time.”**                                                                                                                                                                                                                      | Respect `isError` before the empty-success branch. The header and body now state that fraud alert status is unavailable and direct the user to manual review.                                                                                                                                                                                                                                                                                                   |
| `client/src/pages/ExternalAssessorDashboard.tsx`            | The nested held assessment omitted `fraudScore`. The dashboard defaulted it to zero for threshold styling, producing a green fraud-score presentation beside `—/100`.                                                                                                                                                                                                          | Detect the nested hold before score/default/threshold rendering and show `P0FraudValidationHold` instead. The test-only `initialExpanded` seam preserves normal collapsed production behavior while enabling server-render verification of the expanded row.                                                                                                                                                                                                    |

## Explicit exclusions

This package is limited to false reassurance. It does not address the six verified held-action paths in B-R2, the two held-response crashes in B-R3, the deferred comparator manifest, any server route, or any other client display cleanup. The exact-fingerprint comparator remains blocked until all runtime-risk paths are resolved and the safe diagnostic set is freshly re-derived.

`client/src/components/risk/GeographicRiskClustersPanel.tsx` is explicitly excluded and moved to the **P0-B1-Client Tier-2 / gated backlog**. Current-source reachability verification finds exactly one import in `RiskManagerDashboard.tsx` and no render or other import, so no current user can mount it. The earlier `NaN%` premise was also incorrect. Its eventual reactivation requires a fresh route-and-reachability audit; it is not covered by this urgent live-path package.

The claimed server-side gap requires a correction: current `claims.getGeographicRiskClusters` already selects only operational fields, discards historic fraud projections through `buildP0B1GeographicOperationalClusters`, and returns `fraudDecision: buildP0B1FraudDecisionHold()`. It is therefore not an unguarded geographic fraud-average endpoint on the current lineage. The separate live `claims.getRiskPortfolioAnalytics` route still reads raw fraud score/level and uses zero/low fallbacks; it is recorded as a distinct server-surface finding for narrow future scope and is not silently added to B-R1.

## Validation

Focused guarded validation passed:

```text
3 test files passed
14 tests passed
```

The new executable server-render test covers each current held shape:

- a direct Vehicle Passport hold with a contract-shaped non-null low-risk Passport response renders manual-review guidance while suppressing “No fraud signals detected,” `LOW RISK`, repeat-zone/fraud-alert counts, renewal-risk scoring, and a live-shaped fraud-alert timeline event; an unrelated inspection event remains visible;
- the same non-null Passport response remains withheld while the separate fraud-signals authority query is still pending or has failed; no availability, error, or cache-timing window may restore a fraud-derived green/default presentation;
- a rejected executive-alert query renders unavailable/manual-review guidance and not “All clear”;
- a nested assessment hold renders before the fraud-score row or `—/100` green-default presentation.

A direct TypeScript comparison remains nonzero only because of inherited project diagnostics. The final three-path scope has **no diagnostics on the three application paths or its new test file**.

`git diff --check` passed after the focused run.

### Merge-readiness validation

The isolated guarded suite completed against the composed local lineage after the test-only timestamp assertion repair:

```text
eligible test files: 627
serial guarded shards: 63
failed shards: 0
```

The production client/server build passed using the package `vite build` and `esbuild` commands. The build retains inherited non-blocking warnings in unrelated legacy code: a duplicate `border` key in `BulkValuation.tsx` and oversized existing production chunks. Neither warning is introduced by B-R1.

## Adversarial review corrections

The first adversarial review blocked the initial candidate because its local fraud-card guard left the independent Passport response free to render `LOW RISK`, fraud-derived summary values, and renewal-risk output. The reviewer traced both `aggregateVehiclePassport` and `computeVehicleRenewalRisk` to cross-claim fraud-signal inputs. The correction applies the same canonical direct-hold boundary to every fraud-derived Passport presentation branch and upgrades the renderer fixture from `intelligence: null` to a realistic non-null low-risk response.

The required remediation re-review then blocked a second timing boundary: a cached or fast Passport response could render those same fraud-derived fields while the separate authority query was pending, errored, or absent. The correction now fails closed with the canonical shared manual-review hold unless `getFraudSignals` has conclusively returned a non-held available response. Two server-render tests cover pending and error states with the same non-null low-risk Passport fixture.

The final remediation re-review found a third independent legacy surface in the Vehicle Timeline: the route emits `fraud_alert` events from `fraud_alerts`, and the component rendered them even while the fraud presentation was withheld. The correction filters both the canonical event type and source-table identifier while a presentation hold is active. The three direct/pending/error renderer cases now assert that the fraud event never renders and a non-fraud inspection event remains available.

After the third-path adversarial approval, independent reachability verification corrected the Geographic panel classification. Its current direct import is unused; the panel is not mounted anywhere, and its server route already emits the canonical hold. The Geographic client changes and renderer case were removed rather than leaving an unnecessary change in B-R1. This is a scope reduction, not a claim that the dormant component is fixed.

## Required next steps

1. Commit and open the separate canonical-report test repair (PR #159) for the integration base.
2. Commit B-R1 and open it as a three-path stacked PR targeting that test-repair branch; do not merge either PR without owner approval.
3. After the prerequisite merge, retain the same normal hosted quality gate for the B-R1 source PR before it joins the integration lineage.
4. Continue with B-R2 only after B-R1 reaches its reviewed publication point. B-R3 remains third in the approved severity sequence.
