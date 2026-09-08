# KINGA Cross-Stakeholder Fraud-Data Discovery

**Date:** 8 September 2026  
**Scope:** Read-only discovery covering assessor, panel-beater/repairer, and police/law-enforcement data.  
**Relationship to prior work:** Extends `audit/driver-risk-profile-discovery-2026-09-08.md`.  
**Out of scope:** Implementation, schema/DDL/migration work, data edits, new cross-tenant matching, report changes, and changes to access controls.

## Executive conclusion

KINGA has meaningful stakeholder data for assessors, repairers, and police officers, but it is fragmented across an active legacy entity registry, more formal marketplace/operational tables, and claim-level evidence. The insurer-facing Relationship Intelligence portal reads the legacy registries, while assessor and panel-beater operational records are separately maintained.

The discovery found a second instance of the same unsafe pattern as the driver finding: police-officer records are matched by badge number **without a tenant predicate**, then their historical counts and assessor co-occurrences are updated on the matched row. Stage 8 subsequently uses the same unscoped badge lookup to form an officer-concentration fraud indicator. This is a confirmed accidental cross-tenant data-mixing risk, not a deliberate fraud-network feature.

Assessor and panel-beater legacy registry population uses tenant-scoped matching. However, two reachable portfolio report generators ignore their `tenantId` parameter and query legacy registries without a tenant predicate; both additionally select field names that are absent from the live registry contracts, so they are expected to fail before presenting data. Panel-beater cross-claim signals exist, but they inherit the previously documented missing tenant predicates in driver-linked and repair-history lookups. There is no cross-claim assessor or police-officer signal in `cross-claim-intelligence.ts`.

> **Decision point:** Existing accidental identity matching must not be repurposed as a fraud-network feature. A deliberate cross-insurer network would require a single governed evidence model, explicit authority, provenance, confidence, tenant-source separation, human review, and a lawful data-sharing basis across all stakeholder types.

## Method and evidence boundary

The review inspected current source and read-only live database metadata/aggregate counts. It did not select personal-information values, claim narratives, insurer names, officer identities, or claimant details. Occupancy is therefore reliable as a row count and tenant-count observation, but it does not establish the truth of a historical risk flag or whether any individual has ever been incorrectly matched.

| Evidence source | Scope examined | Key use in this report |
|---|---|---|
| `server/services/entityRegistry.ts` | Legacy stakeholder upsert and Stage 8 helper paths | Establishes identity keys, updates, and missing/present tenant predicates. |
| `server/routers/intelligence.ts` | Relationship Intelligence queries and authority | Establishes tenant-scoped insurer-facing legacy-registry views. |
| `server/db.ts` | Post-pipeline entity registry invocation | Confirms that legacy entity population is part of the active asynchronous completion path. |
| `server/cross-claim-intelligence.ts` | Existing per-claim fraud signals | Establishes the current repairer/panel-beater signal set and its tenant context. |
| `server/reporting/reportDefinitions.ts` and `server/routers/reporting.ts` | Stakeholder performance report definitions and access | Establishes reachable but unscoped portfolio report queries. |
| `drizzle/schema.ts` plus live metadata | Supporting record contracts and aggregate occupancy | Distinguishes active source contracts from legacy field drift and records tenant representation. |

## 1. Assessor inventory

| Data store or capability | Data captured | Population and live occupancy | Current presentation | Tenant-scope assessment |
|---|---|---|---|---|
| **`assessors`** | Professional licence, licence expiry, type, primary tenant, marketplace status, profile, specialisations, certifications, regions, performance/rating and compliance fields. | Created through insurer-owned onboarding or marketplace registration. Live: **6,118 rows across 652 primary tenants**. | Insurer and marketplace operations use this source; it is not the source of the Relationship Intelligence assessor table. | A global professional identity with a `primary_tenant_id`; the licence lookup is global duplicate prevention. This is not the same legacy merge pattern, but requires a deliberate governance position. |
| **`assessor_insurer_relationships`** | Assessor-to-insurer relationship, contract period/rates, assignments, rating and preferred-vendor state. | Created when an insurer owns or links an assessor. Live: **4,416 rows across 652 tenants**. | `listInsurerAssessors` derives assessor access through active relationship rows. | **Tenant-scoped.** The helper filters relationships by the caller’s tenant before returning assessors. |
| **`assessor_evaluations`** | Claim, assessor, cost/duration, damage assessment, recommendations, fraud-risk level, disagreement with KINGA, report provenance and review state. | Created as part of assessor assessment workflow. Live: **176 rows across 92 tenants**. | Used by assessment/review flows, not by the legacy Relationship Intelligence registry. | Carries a direct tenant column. The scoped discovery found no identity-based registry merge in this table. |
| **`assessor_marketplace_reviews`** and **`assessor_reports`** | Tenant-attributed reviews; signed/attested report material with claim/tenant/reviewer lineage. | Marketplace/review/report workflow. Live: **656 reviews across 328 tenants** and **248 reports across 86 tenants**. | Marketplace and assessor report functions. | Both carry tenant IDs. They are better evidence-bearing sources than a registry aggregate but are not currently used as cross-insurer fraud intelligence. |
| **`assessor_registry`** (legacy) | Name/company/accreditation, routing to panel beaters, cost reduction/uplift, routing concentration, cost-suppression and structural-gap counters, risk flags/watchlist state. | Active post-pipeline `processEntityRegistry()` upsert. Live: **0 rows**. | Relationship Intelligence Assessor Registry; an assessor performance portfolio report also targets it. | **Legacy match is tenant-scoped** by assessor name and tenant. No DRV-001-style unscoped identity merge found here. |
| **`assessor_deviation_metrics`** | Assessor/period performance deviations, variance, over/undervaluation rates, sample size, region, vehicle type and related panel beater. | No population path was found in the scoped cross-stakeholder review. Live: **0 rows**. | No established insurer-facing profile consumer found. | Has no tenant column. It cannot be used as tenant-specific or cross-tenant fraud evidence without separate attribution/governance work. |

### Assessor lookup and presentation observations

The legacy `upsertAssessor()` finds an existing row only by `full_name` plus `tenant_id` and updates only that selected row. `checkAssessorRouting()` uses the same tenant-scoped predicate before adding a Stage 8 assessor-routing indicator. The Relationship Intelligence endpoint likewise reads `assessor_registry` with the resolved session tenant; its UI exposes assessor, company, claim count, cost-reduction/routing/cost-suppression signals and a collusion cue. It does not identify data as cross-tenant, because this presentation is tenant-local.

The newer assessor path deliberately enforces professional-licence uniqueness across the system. The onboarding conflict response does not return profile or insurer data, but it can reveal that a licence has previously been registered. Marketplace search is a separate global directory of active marketplace assessors and does not currently include an explicit tenant, consent, source-provenance, or cross-network fraud-evidence layer. These are product/governance matters, not confirmed accidental fraud-data merges.

## 2. Panel-beater / repairer inventory

| Data store or capability | Data captured | Population and live occupancy | Current presentation | Tenant-scope assessment |
|---|---|---|---|---|
| **`panel_beaters`** | Business identity, service and tenant data used by marketplace/assignment workflows. | Operational panel-beater workflow. Live: **72 rows across 2 tenants**. | Operational/marketplace and assignment surfaces. | Direct tenant attribution exists. No identity-merge query was found in the scoped fraud-registry path. |
| **`panel_beater_quotes`** | Claim-linked quotation records, costs, quote states and supporting quote evidence. | Quotation intake/assessment flow. Live: **7,088 rows linked to claims across 3,363 tenants**. | Claim and reporting cost views. | Tenant context derives through the parent claim in the count query. This is commercial claim evidence, not a cross-tenant registry. |
| **`repair_history`** | Repairer, vehicle and claim links; repaired components, costs, AI cost comparison, duration, warranty/repeat-damage results, quality score, fraud signals and tenant ID. | Created when an approved claim has a selected panel beater. Live: **264 rows across 1 tenant**. | Repair history, Vehicle Passport-related information and cross-claim signal generation. | Stores a direct tenant ID, but several intelligence lookups rely on repairer/vehicle IDs without explicitly retaining the tenant predicate. See DRV-006. |
| **`panel_beater_registry`** (legacy) | Company identity, address/contact/VAT data, quote volume, true-cost deviation, below/above-cost counters, structural-gap counts, assessor routing, risk flags and watchlist fields. | Active post-pipeline legacy entity upsert. Live: **0 rows**. | Relationship Intelligence Panel Beater Registry; portfolio performance report targets this table. | Legacy match is **tenant-scoped** by company name plus tenant. No unscoped identity merge was found in its upsert. |
| **Cross-claim repairer signals** | Same repairer on same vehicle, driver+vehicle+repairer recurrence, and repairer+driver repeat use. | Computed after pipeline completion and persisted as claim-level `cross_claim_signals`. Live `cross_claim_signals`: **0 rows**. | Indirectly in claim intelligence if a signal is produced. | Not an intentionally cross-insurer feature. Driver-linked and repair-history query predicates do not consistently retain tenant scope; see DRV-006. |

### Panel-beater lookup and presentation observations

`upsertPanelBeater()` uses `company_name = ? AND tenant_id = ?` before it updates aggregate legacy metrics. The Relationship Intelligence list endpoint applies the caller’s resolved tenant ID. The UI presents a tenant-local table of repairer/quote volume, structural gap, quote deviation and associated risk metrics; it has no cross-tenant provenance or visibility label.

`cross-claim-intelligence.ts` does contain three repairer/panel-beater-related signals: `repairer_repeat_pattern_signal`, `staged_accident_signal`, and `repairer_driver_collusion_signal`. It has no assessor-specific or police-officer-specific cross-claim signal. Its repairer work depends on `repair_history` and, for two signals, driver-linked claims. The input carries `tenantId` and persistence writes it to `cross_claim_signals`, but the upstream data reads do not consistently predicate on that tenant.

## 3. Police and law-enforcement inventory

| Data store or capability | Data captured | Population and live occupancy | Current presentation | Tenant-scope assessment |
|---|---|---|---|---|
| **`police_reports`** | Claim-linked report/case number, station, officer name/badge, date, speed/weather/road/visibility, location/description, violations, citations, witness material, photos/diagram, OCR outputs and discrepancy flags. | Created through `policeReports.create` after verifying access to the parent claim. Live: **2 rows**. Neither resolves to an existing current claim, so their live tenant representation cannot be derived. | Claim-local `PoliceReportForm` displays/adds a report and discrepancy warnings. | The router first resolves the parent claim in the session tenant. The table itself has no tenant column and therefore depends on that parent-claim invariant. |
| **`police_officer_registry`** (legacy) | Officer name/badge/station/rank, claim count and claim IDs, insurer IDs, assessor/claimant co-occurrences, incident locations, concentration, risk and watchlist fields. | Active post-pipeline legacy entity upsert. Live: **9 rows across 1 tenant**. | Relationship Intelligence Officer Registry table. | Name fallback is tenant-scoped, but badge-number match and subsequent concentration lookup are unscoped. See DRV-005. |
| **Stage 8 officer concentration** | Total attended claims, top assessor co-occurrence, collusion-web flag, risk level and score contribution. | Called during Stage 8 after extracting police officer data. | Can become a claim-level fraud indicator. | Badge lookup omits the tenant predicate. This can add another tenant’s aggregate history to the current claim’s fraud assessment. See DRV-005. |
| **External law-enforcement integration** | No active external police/law-enforcement feed, registry synchronisation, case-number matching service, or governed cross-claim police integration was found in this discovery. | Not found. | Not found. | No evidence of a deliberate cross-tenant or cross-agency police-data sharing capability. |

The two current `police_reports` rows have no matching current claim under a read-only referential check. That means they are not a reliable source for a tenant-by-tenant occupancy statement. This is a data-integrity observation, not evidence that the police-report router currently exposes cross-tenant records; the current router resolves the parent claim before normal reads or writes.

## 4. Current presentation and reachability

| Surface | Stakeholder data shown | Present access model | Cross-tenant behavior established by this review |
|---|---|---|---|
| **Relationship Intelligence** (`/insurer-portal/relationship-intelligence`) | Tenant-local legacy officer, assessor and panel-beater registries. | UI route is restricted to insurer risk manager, claims manager, executive, recovery officer and insurer admin roles; the server intelligence authority separately also admits insurer claims processors. | Main registry list queries are tenant-scoped. No direct cross-tenant UI list was found. However, officer registry history may already be contaminated by DRV-005 before it reaches this display. |
| **Police Report Form** | The police report for the current claim and claim-vs-report discrepancies. | Claim-local tRPC query/mutation. | Parent-claim tenant scope is checked in the reviewed router. No cross-claim officer registry display occurs here. |
| **Assessor Performance Report** (`portfolio.assessor_performance`) | Intended assessor performance fields from `assessor_registry`. | Available to insurer admin, claims processor, claims manager and risk manager through the report matrix. | Generator ignores its tenant parameter and has incompatible selected columns; it is expected to error rather than reliably display a tenant-local or global report. See DRV-007. |
| **Panel Beater Performance Report** (`portfolio.panel_beater_performance`) | Intended legacy panel-beater performance fields. | Available to insurer admin, claims manager and risk manager. | Generator ignores its tenant parameter and has incompatible selected columns; it is expected to error rather than reliably display a tenant-local or global report. See DRV-008. |
| **Marketplace assessor search** | Active independent assessor profiles and performance filters. | `protectedProcedure`; reviewed endpoint does not apply an insurer role or tenant filter. | This is a global marketplace directory, not fraud intelligence. It lacks an explicit cross-network evidence/provenance model. |

## 5. Consolidated findings ledger

The numbering continues the driver discovery series. None of the entries below was remediated in this task.

| ID | Severity | Status | Evidence and impact |
|---|---|---|---|
| **DRV-005 — Police badge matching mixes tenant histories** | **High** | **Confirmed; active population path.** The registry currently has 9 rows, albeit in 1 represented tenant. | `upsertOfficer()` queries `police_officer_registry` by `badge_number` alone, then updates claim count, claim IDs and assessor co-occurrences by row ID. `checkOfficerConcentration()` repeats the unscoped badge query. Stage 8 uses the result as an officer-concentration fraud indicator. A badge present for more than one insurer can cause one tenant’s officer history and assessor associations to influence another tenant’s claim risk outcome. |
| **DRV-006 — Repairer/cross-claim signals lack defense-in-depth tenant predicates** | **Medium** | **Confirmed query shape; latent report-impact path.** `repair_history` has 264 rows; `cross_claim_signals` and `driver_claims` are currently empty. | The repairer-repeat, staged-accident and repairer-driver-collusion logic filters by repairer/vehicle/driver IDs and timestamps but does not consistently predicate `repair_history`, `driver_claims`, or joined claims on `input.tenantId`. Signals are persisted with a tenant ID, but evidence acquisition is not consistently tenant-scoped. It does not itself prove a current cross-tenant row match; it is unsafe once upstream identity/link data crosses a boundary. |
| **DRV-007 — Assessor performance report ignores tenant and selects absent fields** | **High** | **Confirmed reachable code path; report likely errors before display.** `assessor_registry` is currently empty. | `generateAssessorPerformanceReport()` receives `tenantId` but queries `assessor_registry` only by period. It selects `assessor_name`, `anomaly_score` and `last_claim_date`, which do not exist in the live contract; the source of truth uses `full_name`, `risk_score`, and no `last_claim_date`. If the field drift were corrected without adding tenant scope, the report could disclose cross-tenant data. |
| **DRV-008 — Panel-beater performance report ignores tenant and selects absent fields** | **High** | **Confirmed reachable code path; report likely errors before display.** `panel_beater_registry` is currently empty. | `generatePanelBeaterPerformanceReport()` receives `tenantId` but has no tenant predicate. It selects absent fields including `total_claims_repaired`, `anomaly_score`, and `last_claim_date`; the live contract uses `total_quotes_submitted`, `risk_score`, and has no `last_claim_date`. Correcting field names alone would create a reachable unscoped report. |
| **DRV-009 — Police-report rows lack a current claim parent** | **Medium** | **Confirmed current data-integrity observation; not an established UI disclosure.** | Live aggregate validation found 2 `police_reports` rows, and 0 join to a current `claims` row. Because `police_reports` has no tenant column, those rows cannot currently be attributed to a tenant through the expected parent relationship. The normal router path remains claim-scoped; separate data-integrity review is required before interpreting these rows. |

### Observations that require governance rather than defect reclassification

The global assessor professional-licence lookup and marketplace search are not classified as accidental cross-tenant fraud matching in this report. They are structurally global platform capabilities: one prevents duplicate assessor profiles and the other lists active marketplace assessors. They nevertheless require a clear product statement on marketplace consent, identity verification, access logging, data minimisation, and the distinction between provider discovery and a fraud allegation.

## 6. What a deliberate governed cross-stakeholder network would require

A deliberate fraud-intelligence network should be treated as one governed capability across driver, assessor, panel beater, and police data—not four parallel extensions of legacy registries. The following minimum decisions are needed before design or implementation begins.

| Required decision or control | Why it applies across all stakeholder types |
|---|---|
| **Authoritative entity and identity-resolution model** | Each entity needs an explicit identifier strategy, source record, match confidence, match method, match timestamp, false-positive resolution process, and tenant-of-origin. Names alone are insufficient; badge/licence/registration values are sensitive and can be reused or incorrectly extracted. |
| **Tenant-local default with explicit network authority** | Data must remain tenant-local unless a defined legal basis, consent/contractual mechanism, purpose limitation and platform authority permits an explicitly requested shared-network view. A missing predicate can never stand in for policy. |
| **Evidence provenance and separation** | A profile must distinguish tenant-local evidence, cross-network aggregate evidence, source count, confidence, matching basis, data freshness, and whether a value is observed or derived. It must never present a cross-network aggregate as if it came from the current insurer’s files. |
| **Human review and adverse-decision controls** | Risk signals should create review prompts, not automatic coverage, fraud, payment or blacklisting outcomes. Any adverse action requires qualified human review and an evidence trace suitable for challenge and correction. |
| **Access model and immutable audit trail** | Authorised roles, purpose-of-use, queried entity, matched source scope, displayed evidence fields, export/print behavior, and reviewer action must be recorded. Access should be narrower for police, personal driver and financial/provider data than for a generic portfolio metric. |
| **Data quality and remediation** | Orphan records, field-name drift, stale registry aggregates, incomplete identity fields and unscoped legacy queries must be corrected before any new network surface relies on them. Current DRV-001 and DRV-005 are safety remediation work, not seed data for a network. |
| **Retention, correction and disclosure policy** | The business needs a retention period, challenge/correction process, watchlist governance, source notification rule, regional jurisdiction analysis, and a documented approach to data subject access/rectification where applicable. |
| **Testing and release evidence** | Before activation, prove tenant-local isolation, expressly authorised cross-network scope, negative match behavior, match-confidence thresholds, audit emission, report/export redaction, and degradation behavior with owned real fixtures. |

## Conclusion

Assessor and panel-beater data already supports meaningful tenant-local operational and fraud analysis, while police data is captured both at claim level and in a legacy officer registry. The present system does **not** have a safe, deliberate cross-insurer fraud network. It does have accidental cross-tenant risks—most clearly police badge matching—and report generator defects that must remain separate from any product expansion.

The appropriate next decision is whether to commission a bounded remediation of the confirmed safety findings before any cross-stakeholder feature discussion, or to first develop a business/legal governance brief that defines whether a shared network should exist at all. This discovery does not recommend implementing either path without that decision.

