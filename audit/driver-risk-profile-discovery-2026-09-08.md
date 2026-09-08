# KINGA Driver Risk-Profile Discovery

**Date:** 8 September 2026  
**Scope:** Read-only discovery of driver-level risk, history, identity, presentation, and tenant-boundary capability.  
**Out of scope:** Any code, database schema, data, report, role, or access-control modification.

## Executive conclusion

KINGA already contains substantial driver-related capability, but it is divided between two materially different data paths. The currently populated and user-visible path is the **legacy `driver_registry`** entity registry. It is populated asynchronously after a completed pipeline and displayed in the insurer Relationship Intelligence portal. The newer **`drivers` plus `driver_claims`** model has a richer, role-aware driver-to-claim contract and a tenant-scoped router, but it currently has only two driver rows, no `driver_claims` rows, and no direct client consumer found by the source search.

Neither the Vehicle Passport nor the three principal report tiers presently provides an insurer-facing, per-driver risk profile. The reports present limited claim-extracted driver identity facts, such as licence number, licence-age range, and whether the driver is the policyholder; they do not present registry-backed claim history, repeat-claim status, staged-accident status, or a driver risk score.

The discovery also confirmed a separate **high-priority tenant-data-mixing concern** in the active legacy registry path. `entityRegistry.upsertDriver()` finds an existing driver by ID number or licence number without a tenant predicate, then updates that row. `checkDriverHistory()` repeats the same unscoped identity lookup and Stage 8 uses its result to generate fraud indicators for a claim. This can mix one insurer tenant’s driver-history data into another tenant’s assessment when the same identifier appears in both. No change was made in this discovery task.

## Method and evidence boundary

The review consisted of static inspection of the schema, current server and client source, and read-only live database metadata and aggregate counts. No personal-information values, claim details, or tenant identifiers were selected. The live count results establish current occupancy, not the correctness of every historical row.

| Evidence item | What was checked | Finding |
|---|---|---|
| `drizzle/schema.ts:4700-4791` | Canonical driver and driver-claim contract | A tenant-labelled driver record and role-aware driver-to-claim join table exist. |
| Live database metadata | Driver-related tables, views, and indexes | Both `drivers`/`driver_claims` and legacy `driver_registry` exist; `vw_driver_risk_summary` and `vw_fleet_driver_risk` also exist. |
| Live aggregate counts | Driver stores only | `driver_registry`: 38 rows across 2 tenants; `drivers`: 2 rows in 1 tenant; `driver_claims`: 0 rows; `fleet_drivers`: 0 rows; `claim_features`: 2,499 rows across 150 tenants. |
| `server/db.ts:3196-3298` | Post-pipeline entity registration | The active pipeline invokes `processEntityRegistry()` asynchronously. |
| `client/src/pages/RelationshipIntelligence.tsx:92-113,442-492` | User-facing display | The insurer portal currently shows a legacy Driver Registry table, not a per-driver profile. |

## 1. Driver-level data inventory

| Data store or capability | Captured fields and meaning | Population / current occupancy | Current presentation | Assessment |
|---|---|---|---|---|
| **`driver_registry`** (legacy) | Name, national ID, licence number/class/issue/expiry, address changes, phone/email arrays, total claims split by role, prior insurers, last claim date, risk score/flags, watchlist status and reason. | The pipeline calls `processEntityRegistry()` after completion; the legacy driver upsert is part of that operation. Live metadata shows **38 rows / 2 tenants**. | **Yes.** Relationship Intelligence displays a Driver Registry table. | This is the active visible source, but its identity matching and history lookup are not consistently tenant-scoped. |
| **`drivers`** (canonical/newer) | Name, normalised licence, DOB, contact data, national ID, licence country/dates, total and at-fault claim counts, driver risk score, repeat-claimer and staged-accident flags, last fraud score, provenance and OCR confidence. | Static source contains `matchOrCreateDriver()` and `upsertDriverFromClaim()`. No caller was found outside its own module. Live metadata shows **2 rows / 1 tenant**. | **No direct client or report consumer found.** | Richer target model, but it is not currently the operative insurer-facing source. |
| **`driver_claims`** (canonical/newer) | Links a driver to a claim with role (`driver`, `claimant`, `passenger`, `third_party_driver`, `witness`, `unknown`), at-fault, injury, notes and tenant label. | `linkDriverToClaim()` exists. Live metadata shows **0 rows**. | No direct client consumer found. | The correct structure for a claim-specific driver profile, but not currently populated enough to support one. |
| **`claim_features`** | Includes legacy `driver_registry_id`, claimant registry ID and a `driver_total_claims` feature field. | Created by the active entity-registry flow; live metadata shows **2,499 rows / 150 tenants**. The current source writes `driver_total_claims` as `null`, pending a batch job. | No standalone display found. | Useful lineage to the legacy registry, but not an authoritative driver profile and not populated with its own driver-history count. |
| **Cross-claim intelligence** | Can produce driver repeat-claim, driver/vehicle repetition, repairer-driver collusion and claim-velocity signals. | `runCrossClaimIntelligence()` receives `driverRegistryId` from `claims`, then writes claim-level `cross_claim_signals`. | Indirect only, when a signal becomes part of claim intelligence. | There is no dedicated driver fraud-history table; driver-related fraud evidence is primarily claim-scoped. |
| **Fraud alerts** | Claim-level alerts, severity and descriptions. | The `intelligencePlatform.getDriverSignals` endpoint returns alerts, but its query filters only by tenant, not driver membership. | No client consumer found. | The endpoint cannot currently support a reliable per-driver fraud-alert statement. |
| **Fleet drivers and fleet incidents** | Fleet employment link, licence number/expiry/class, hire/employment state, fleet incident reports and fleet risk views. | `fleet_drivers` currently has **0 rows**. `fleet_incident_reports` and fleet risk views exist in the schema/metadata. | Fleet-specific dashboards, not the insurer claim portal. | A separate employer/fleet identity model, not linked in the reviewed code to `drivers` or `driver_registry`. |
| **Claimant registry/history** | Claimant identity, claim aggregates, insurer history, risk/watchlist fields; a separate `claimant_history` table also exists. | `claimant_registry` has **5 rows / 1 tenant**; `claimant_history` is currently empty. | Relationship Intelligence has claimant-registry capability. | Distinct from a driver record; it must not be treated as a proxy for driver history. |
| **Licence and policy data** | `insurance_policies` identifies a customer and vehicle; `licensing_records` records fleet/vehicle licensing, not personal driver licence history. | Both contracts exist. | Existing claim reports display limited licence data. | No reviewed source established an insurer-grade personal driver-licence renewal/violation history. |

## 2. What is currently surfaced

### Insurer Relationship Intelligence

`/insurer-portal/relationship-intelligence` is the only identified insurer-facing UI that presents registry-backed driver information. Its Driver Registry tab calls `intelligence.getDriverRegistry`, which reads the **legacy** `driver_registry` table. It displays driver name, licence number, ID number, claims as driver, claims as claimant, address changes, and licence expiry. The table has no row action, detail route, claim drill-down, driver risk score, risk flags, watchlist explanation, at-fault count, fraud evidence, or cross-claim history timeline.

At the client route, this area is limited to insurer users whose sub-role is risk manager, claims manager, executive, recovery officer, or insurer administrator. The server intelligence authority also allows claims processors. That difference should be made explicit in any later access-design decision rather than assumed away.

### Claim reports and Vehicle Passport

The report contract `ResolvedReportRecord.driver` holds only three fields: `licenceNumber`, `licenceAgeRange`, and `isPolicyholder`. The report definition uses these as claim-context display facts. The Claims Intelligence report shows claimant and vehicle information, while the forensic model includes a driver-licence field. No reviewed CL, CI, FR, Vehicle Passport service, or Vehicle Passport panel reads `drivers`, `driver_claims`, `driver_registry`, or a driver risk score. `driverClaims` is imported by the Vehicle Passport aggregation module but has no use in that module.

> A driver risk profile is therefore **captured in part but not available as a claim-linked, insurer-facing profile**. The current Relationship Intelligence table is an aggregate registry list, not a profile tied to the driver on the claim under review.

## 3. Driver, claimant, and policyholder distinction

The data model is capable of distinguishing these roles, although the active and newer data paths are not yet aligned.

| Concept | Current representation | Important distinction |
|---|---|---|
| **Claimant** | `claims.claimantId`, claimant contact/identity fields, legacy `claimant_registry`, and the `driver_claims` role `claimant`. | The claimant is the person or entity lodging the claim, and may be a company, owner, representative, or another person. |
| **Insured driver** | `claims.driverRegistryId` in the newer model; `driver_claims.role = 'driver'`; claim-extracted driver fields in the pipeline. | The driver is expressly not assumed to be the claimant or vehicle owner. |
| **Third-party driver** | `claims.thirdPartyDriverRegistryId`; `driver_claims.role = 'third_party_driver'`. | A second distinct driver can be represented. |
| **Policyholder / policy customer** | The report contract currently exposes only `driver.isPolicyholder`; `insurance_policies` identifies `customerId`, vehicle and policy, but no reviewed driver-to-policyholder relation was found. | The system does not yet establish a resolved, auditable mapping from the driver registry to the policy customer for this use case. |
| **Fleet driver** | `fleet_drivers.userId`, plus employment and licence data; claims may reference `claims.fleetDriverId`. | This is an employment assignment and remains distinct from the general driver registry. |

The newer `upsertDriverFromClaim()` deliberately creates separate records and `driver_claims` role links for insured driver, claimant, and third-party driver. Conversely, the active post-pipeline `processEntityRegistry()` persists legacy driver and claimant registries and stores their IDs on `claim_features`; it does not establish the newer claim driver links in the reviewed path. A driver profile feature must therefore not silently conflate the two models.

## 4. Candidate insurer-facing integration boundaries

These are candidate boundaries for a product decision, not an implementation recommendation.

| Candidate boundary | Fit with current evidence | Benefits | Constraints and decision dependencies |
|---|---|---|---|
| **Extend Vehicle Passport** | Weak to moderate. Vehicle Passport is vehicle-centric and can span more than one driver. | Familiar placement for assessors viewing related vehicle intelligence. | Requires an explicit rule for which driver is shown: current claim driver, policyholder, every linked driver, or a historical aggregate. Without that rule, a vehicle panel risks implying that another driver’s history belongs to the driver of the current incident. |
| **Separate claim-adjacent Driver Risk panel** | Strongest conceptual fit once an authoritative driver identity is chosen. | Can show the current claim’s role-specific driver, distinguish claimant and third party, and preserve a claim-to-driver evidence trail. | Should use a single resolved driver contract after the parent claim and tenant scope are resolved. It cannot safely be built on an ad hoc query across the two current registry models. |
| **Role-specific risk-management report** | Potentially useful for portfolio review, not necessary for claim-level decision support. | Supports risk manager and executive trend analysis without overloading individual claim reports. | Requires decisions on cohort/date range, aggregation, permitted roles, retention, and whether any cross-insurer benchmarking is lawful and consented. |

The natural future pattern would be a dedicated resolved driver record—rather than extending `ResolvedReportRecord` indiscriminately—created only after resolving the claim and session tenant. Before that boundary can be designed, the product owner needs to nominate the authoritative identity store and decide whether the legacy registry will be remediated, migrated, or retained as a separate historical evidence source.

## 5. Cross-tenant and evidence-governance findings

### DRV-001 — Legacy ID/licence matching can mix driver history across tenants

**Severity:** High.  
**Status:** Confirmed in current source; no data mutation or exploit simulation was performed.

`server/services/entityRegistry.ts:169-180` looks up an existing `driver_registry` record by `id_number` or `licence_number` without `tenant_id`. If found, the subsequent update at lines 203-227 increments its claim counters, appends claim IDs and changes its historical fields without a tenant predicate. The active post-pipeline flow invokes this upsert from `server/db.ts:3196-3298`.

The same service’s `checkDriverHistory()` reads `driver_registry` by national ID or licence number without `tenant_id` at lines 893-899. Stage 8 calls it for the current claim at `server/pipeline-v2/stage-8-fraud.ts:1117-1133`; its output becomes a `DRIVER_HISTORY_PATTERN` fraud indicator. A Tenant B claim submitted with an identifier first recorded for Tenant A can therefore inherit Tenant A history statistics and produce a fraud/risk statement based on another tenant’s data.

This is both an integrity issue and a potential indirect disclosure issue. The current path does not show foreign claim references in the reviewed call site, but it may surface foreign-derived counts, recency, address-change information, and a fraud indication in the new claim’s analysis/report. Read-only aggregate checks found no duplicate licence or national-ID values represented in *separate rows* across tenants; that does not rule out this issue, because the unscoped upsert can consolidate the two tenants’ observations into one row.

### DRV-002 — New driver model has a global licence uniqueness constraint despite tenant-scoped matching

**Severity:** Medium.  
**Status:** Confirmed design incompatibility; no current duplicate was observed.

`matchOrCreateDriver()` looks up a licence number together with `tenantId`, but the live `drivers.idx_drivers_license_number` index is globally unique on `license_number` alone. The same individual recorded under a second tenant cannot receive a separate canonical driver row through the normal create path; the duplicate exception recovery also searches only within the second tenant. This is primarily an availability/integrity problem, but it is relevant to any intended multi-tenant driver identity model and may create observable collision behaviour.

### DRV-003 — Cross-claim driver evidence lacks defense-in-depth tenant predicates

**Severity:** Medium.  
**Status:** Confirmed missing predicates; live `driver_claims` occupancy is currently zero.

Several driver-history queries in `server/cross-claim-intelligence.ts` filter `driverClaims.driverId` and claim IDs/timestamps but not `driverClaims.tenantId` or the joined claim tenant. The service writes resulting signal records with the current input tenant. The canonical router helpers do use tenant predicates, but this internal pipeline service does not. Because `driver_claims` is currently empty, this discovery cannot show a present erroneous output; the query shape remains a latent cross-tenant evidence-mixing risk once canonical driver links are populated.

### DRV-004 — The driver-signals endpoint does not restrict fraud alerts to the selected driver

**Severity:** Medium (data-provenance/correctness), not a cross-tenant disclosure finding.  
**Status:** Confirmed in source; no client consumer found.

`intelligencePlatform.getDriverSignals` correctly selects the requested driver under the caller’s tenant. Its subsequent fraud-alert query filters only `claims.tenantId`, however, and does not join `driver_claims` or otherwise associate the alert with the requested `driverId`. The endpoint would attach all fraud alerts for the tenant to any selected driver. It is currently unused by the client, but it is not safe evidence for a future per-driver profile without correction.

## 6. Product and design decisions required before implementation

| Decision | Why it is required |
|---|---|
| **Authoritative driver identity and history source** | The active visible legacy registry and the richer newer `drivers`/`driver_claims` model are not aligned. A new panel cannot reliably combine them without an explicit ownership/migration decision. |
| **Definition of “driver risk profile”** | Decide which evidence is genuinely relevant: claim frequency, at-fault count, recency, staged-accident status, verified fraud signals, licence validity, address changes, fleet incidents, or only a subset. Derived risk conclusions must name their evidence basis and avoid implying a conviction or coverage outcome. |
| **Driver selection on a claim** | Define whether the panel shows insured driver, claimant, third-party driver, all involved drivers, or no profile when the relationship is unresolved. |
| **Tenant and cross-insurer policy** | The safe default is tenant-local data only. Any cross-insurer identity matching or history sharing needs a separate legal, consent, governance, retention, and audit decision; it must not be inferred from technical convenience. |
| **Access model and data minimisation** | Current Relationship Intelligence UI admits risk manager, claims manager, executive, recovery officer, and insurer administrator; the server separately permits claims processors. Decide the approved roles, whether licence/national-ID values must be masked, what access events are audited, and what can enter a report artifact. |
| **Report use and human review** | Decide whether profile data is advisory context only, a review trigger, or a report section. It must not become an automatic coverage, fraud, or settlement decision without a separately approved decision-governance contract. |
| **Remediation sequencing** | Resolve the confirmed tenant-boundary findings independently before relying on the legacy registry in a new insurer-facing feature. They are existing safety concerns, not feature work to be folded into a product enhancement. |

## Conclusion

There is enough existing data to justify a product decision about driver intelligence, but not yet a safe implementation decision. The currently displayed legacy registry contains useful aggregate history and licence data, while the newer driver model supplies the better long-term role-aware shape. The two are not yet a single authoritative tenant-safe contract. Any future driver profile should first address this ownership boundary and the confirmed legacy tenant-scoping defects, then establish a claim-adjacent resolved data contract with explicit roles, evidence provenance, and insurer access rules.

