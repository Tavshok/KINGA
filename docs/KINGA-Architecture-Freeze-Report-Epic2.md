# KINGA Architecture Freeze Report — Epic 2 (Agency Activation)

**Date:** 2026-07-30  
**Status:** FINAL (Amended 2026-07-30 — Change 11 reclassified per product sign-off) — No code changes made  
**Reviewer:** Chief Software Architect  
**Author:** Tavonga Shoko  
**Scope:** Epic P2 as defined in KINGA Engineering Backlog v1.0 and KINGA Implementation Specification v1.0  
**Method:** Read-only codebase inspection across `server/routers/agency.ts`, `server/routers/agency-broker.ts`, `server/routers/platform-user-roles.ts`, `server/routers/admin.ts`, `server/pipeline-v2/photoForensicsEngine.ts`, `server/pipeline-v2/imageIntelligence.ts`, `server/insurance/valuation-engine.ts`, `server/reporting/reportDefinitions.ts`, `client/src/pages/KingaAgency.tsx`, `client/src/pages/AgencyFleetQuotes.tsx`, `client/src/pages/PlatformUserRoleManager.tsx`, `client/src/pages/ClaimantDashboard.tsx`, `client/src/components/ClaimantPortalLayout.tsx`, `drizzle/schema.ts`, and all related test files.

---

## 1. What Epic 2 Proposes

The backlog items P2-E1 through P2-E3 propose the following work to activate the Agency module and build pre-insurance verification:

**P2-E1 — Agency Module Activation (4 features)**
1. Update `agencyProcedure` guard to permit `agency` role (P2-E1-F1)
2. Build a new Admin UI for agency role assignment — new page `AdminRoleAssignment.tsx` and new `admin.assignRole` procedure (P2-E1-F2)
3. Build a new Customer workspace layout — new `CustomerLayout.tsx` and `/customer` route group (P2-E1-F3)
4. Build a new Customer case tracking page — new `customer.getCases` procedure and `CustomerCaseTracking.tsx` (P2-E1-F4)

**P2-E2 — Pre-Insurance Photo Verification (6 features)**
5. Add perceptual hashing (pHash) to `photoForensicsEngine.ts` — new library, new DB column, new computation (P2-E2-F1)
6. Build a cross-submission pHash similarity query — new `findSimilarImagesByPHash()` in `db.ts` (P2-E2-F2)
7. Add `exifAbsent` flag to `PhotoForensicsResult` (P2-E2-F3)
8. Add AI-generated image detection — new LLM vision call with `aiGenerationScore` and `aiGenerationFlag` (P2-E2-F4)
9. Build a Vehicle Verification Report template (P2-E2-F5)
10. Build a Vehicle Valuation Report template (P2-E2-F6)

**P2-E3 — Agency Valuation Procedure (1 feature)**
11. Expose `generateVehicleValuation()` as `agency.getValuation` tRPC procedure, with optional `valuationDate` parameter added to the engine (P2-E3-F1)

---

## 2. Architecture Freeze Review — Seven-Question Challenge

Each proposed change is challenged against the seven mandatory questions.

---

### Change 1 — P2-E1-F1: Update `agencyProcedure` guard to permit `agency` role

**1. Is this genuinely required?**  
No. This change was completed in Epic 1 Task 5. The `agencyProcedure` in `agency-broker.ts` now imports `agencyDomainProcedure` from `domain-middleware.ts`, which already permits `agency`, `admin`, and `platform_super_admin`. The R-INF-09 comment block in `agency-broker.ts` (line 30–34) explicitly documents this as "ACTIVATED 2026-07-30".

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Yes. Completely. Epic 1 Task 5 delivered this change. The guard is active.

**3. Can an existing component simply be exposed instead?**  
Not applicable — the work is already done.

**4. Is there a smaller change that achieves the same result?**  
Not applicable — the work is already done.

**5. Does this introduce unnecessary architectural complexity?**  
Not applicable — the work is already done.

**6. Does this duplicate an existing KINGA capability?**  
Not applicable — the work is already done.

**7. Does this violate any platform principles?**  
Not applicable — the work is already done.

**Classification: ALREADY COMPLETE — Remove from Epic 2 work package. Zero implementation effort required.**

---

### Change 2 — P2-E1-F2: Admin UI for agency role assignment (new `AdminRoleAssignment.tsx` + new `admin.assignRole` procedure)

**1. Is this genuinely required?**  
The business requirement is genuine: an administrator must be able to assign the `agency` role to a user without direct database access. However, the proposed implementation (new page, new procedure) is not required.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Yes. `server/routers/platform-user-roles.ts` already exports `platformUserRolesRouter.assignRole`, a `superAdminProcedure`-guarded mutation that accepts `{ targetUserId, newRole, newInsurerRole?, justification? }` and writes every change to the `roleAssignmentAudit` table. The corresponding frontend page `client/src/pages/PlatformUserRoleManager.tsx` already provides a searchable user list, role dropdown, confirmation dialog, justification field, and audit history view — all wired to the existing procedure.

The only gap is that `PLATFORM_ROLES` in `platform-user-roles.ts` (line 19–31) does not yet include `'agency'`, and the matching constant in `PlatformUserRoleManager.tsx` (line 54–63) also omits it.

**3. Can an existing component simply be exposed instead?**  
Yes. Adding `'agency'` to the `PLATFORM_ROLES` constant in `platform-user-roles.ts` and the matching array in `PlatformUserRoleManager.tsx` is sufficient. No new page, no new procedure, no new route.

**4. Is there a smaller change that achieves the same result?**  
Yes. Two constant array additions (one in the router, one in the frontend page) replace the entire proposed feature.

**5. Does this introduce unnecessary architectural complexity?**  
The proposed implementation would introduce a second role-assignment surface (`/admin/roles` alongside `/platform/user-role-manager`) and a second role-assignment procedure (`admin.assignRole` alongside `platformUserRoles.assignRole`). This is direct duplication of an existing capability.

**6. Does this duplicate an existing KINGA capability?**  
Yes. `platformUserRoles.assignRole` and `PlatformUserRoleManager.tsx` already provide exactly this capability.

**7. Does this violate any platform principles?**  
Yes. The platform principle "Never create duplicate functionality — always reuse existing KINGA platform services" is violated by the proposed implementation.

**Classification: REUSE EXISTING**  
**Approved work:** Add `'agency'` to `PLATFORM_ROLES` in `platform-user-roles.ts` and the matching array in `PlatformUserRoleManager.tsx`. Two constant additions. No new files, no new procedures, no new routes.

---

### Change 3 — P2-E1-F3: Customer workspace layout and routing (new `CustomerLayout.tsx` + `/customer` route group)

**1. Is this genuinely required?**  
The business requirement is genuine: customers need a dedicated portal. However, the proposed implementation (new layout, new route group) is not required.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Yes. `client/src/components/ClaimantPortalLayout.tsx` already provides a dedicated customer-facing layout with a persistent sidebar, KINGA branding, role badge, and navigation sections (My Claims, Fleet Management, Documents, Support). The existing `/claimant/*` route group serves exactly the customer-portal purpose. The `claimant` role in KINGA is the customer role — the `users.role` enum has no separate `customer` value, and none is proposed in Epic 1 or Epic 2.

**3. Can an existing component simply be exposed instead?**  
Yes. `ClaimantPortalLayout.tsx` and the `/claimant/*` routes already exist and are already role-gated. No new layout or route group is needed.

**4. Is there a smaller change that achieves the same result?**  
Yes. Zero changes are needed to the layout or routing layer. If the Agency portal needs to link customers to their tracking page, the existing `/claimant/dashboard` route already serves this purpose.

**5. Does this introduce unnecessary architectural complexity?**  
Yes. A parallel `/customer` route group alongside `/claimant` would create two separate customer-facing surfaces for the same user role, requiring maintenance of two layouts and two route namespaces.

**6. Does this duplicate an existing KINGA capability?**  
Yes. `ClaimantPortalLayout.tsx` and `/claimant/*` routes already provide the customer portal.

**7. Does this violate any platform principles?**  
Yes. "Never create duplicate functionality."

**Classification: REUSE EXISTING**  
**Approved work:** None. The existing `/claimant` portal and `ClaimantPortalLayout.tsx` satisfy this requirement. If the Agency intake flow needs to direct a customer to their case tracking, it should link to `/claimant/dashboard`.

---

### Change 4 — P2-E1-F4: Customer case tracking page (new `customer.getCases` + new `CustomerCaseTracking.tsx`)

**1. Is this genuinely required?**  
The business requirement is genuine: a customer needs to see their quotations, policies, and claims. However, the proposed implementation is not required.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. `ClaimantDashboard.tsx` (at `/claimant/dashboard`) already calls `trpc.claims.myClaims` (defined in `server/routers.ts` line 1511) which returns all claims scoped to the authenticated user. The existing `agency.myQuotations` and `agency.myPolicies` procedures in `server/routers/agency.ts` return user-scoped quotations and policies. The data sources exist; they are simply not yet aggregated into a single tracking view.

**3. Can an existing component simply be exposed instead?**  
Largely yes. The `ClaimantDashboard.tsx` page already provides the claims view. The quotation and policy data can be added to this page by calling the existing `agency.myQuotations` and `agency.myPolicies` procedures, which are already implemented and scoped to the authenticated user.

**4. Is there a smaller change that achieves the same result?**  
Yes. Extend `ClaimantDashboard.tsx` to include quotation and policy tabs by calling the existing `agency.myQuotations` and `agency.myPolicies` procedures. No new procedure, no new page, no new route.

**5. Does this introduce unnecessary architectural complexity?**  
Yes. A new `customer.getCases` procedure would aggregate data that three existing procedures already provide individually, adding a new aggregation layer without architectural benefit.

**6. Does this duplicate an existing KINGA capability?**  
Yes. `trpc.claims.myClaims`, `trpc.agency.myQuotations`, and `trpc.agency.myPolicies` already provide the underlying data.

**7. Does this violate any platform principles?**  
Yes. "Never create duplicate functionality."

**Classification: SIMPLIFY**  
**Approved work:** Extend `ClaimantDashboard.tsx` to add quotation and policy tabs using the existing `agency.myQuotations` and `agency.myPolicies` procedures. No new procedures, no new pages, no new routes. One file modified.

---

### Change 5 — P2-E2-F1: Perceptual hashing (pHash) in `photoForensicsEngine.ts` — new library required

**1. Is this genuinely required?**  
The business requirement is genuine: near-duplicate image detection across claims and pre-insurance submissions requires a perceptual hash that is robust to JPEG re-compression, unlike the existing SHA-256 cryptographic hash. A pHash column in `ingestionDocuments` is required for cross-submission queries.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. `server/pipeline-v2/imageIntelligence.ts` already implements `computeThumbnailHash()` (line 287–299) using `sharp` to resize images to 8×8 greyscale and compute a 64-bit average-hash string, and `hammingDistance()` (line 302–308) for threshold comparison. This is functionally equivalent to a difference hash (dHash), which is a standard perceptual hashing algorithm. The `sharp` library is already a project dependency.

**3. Can an existing component simply be exposed instead?**  
Yes. `computeThumbnailHash()` and `hammingDistance()` from `imageIntelligence.ts` can be imported directly into `photoForensicsEngine.ts`. No new library is required. The backlog item P2-E2-F1-T1 (research and select a pHash library) and P2-E2-F1-T2 (install the selected pHash library) are eliminated.

**4. Is there a smaller change that achieves the same result?**  
Yes. Import and call the existing `computeThumbnailHash()` function. Add the `pHash` column to `ingestionDocuments`. Store the result. The library selection and installation tasks are removed.

**5. Does this introduce unnecessary architectural complexity?**  
The proposed approach (new library) would introduce a second perceptual hashing implementation alongside the existing one. Reusing the existing implementation avoids this duplication.

**6. Does this duplicate an existing KINGA capability?**  
Yes, if a new library is installed. The existing `computeThumbnailHash()` already provides perceptual hashing.

**7. Does this violate any platform principles?**  
Installing a new library when an equivalent exists in the codebase violates "Never create duplicate functionality."

**Classification: SIMPLIFY**  
**Approved work:** Export `computeThumbnailHash` and `hammingDistance` from `imageIntelligence.ts`. Import them in `photoForensicsEngine.ts`. Add `pHash varchar(64) nullable` column to `ingestionDocuments` via raw SQL (consistent with Epic 1 migration approach). Store the computed hash. No new library installation.

---

### Change 6 — P2-E2-F2: Cross-submission pHash similarity query (`findSimilarImagesByPHash`)

**1. Is this genuinely required?**  
Yes. The fraud-detection use case requires querying the `ingestionDocuments` table for records where the stored pHash is within a Hamming distance threshold of a new submission's pHash. This is a new query function that does not exist anywhere in the codebase.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The existing `hammingDistance()` function operates on two in-memory strings. There is no database query that retrieves records by pHash similarity. MySQL does not natively support Hamming distance queries on varchar columns; the query must fetch candidate records and compute distance in application code, or use a BIT_COUNT(a XOR b) approach for binary representations.

**3. Can an existing component simply be exposed instead?**  
No. This is a genuinely new query function.

**4. Is there a smaller change that achieves the same result?**  
The implementation should fetch all records with non-null pHash values for the relevant tenant and filter in application code using the existing `hammingDistance()` function. This avoids complex SQL and reuses the existing utility. For the current data volumes in the KINGA platform, application-side filtering is appropriate.

**5. Does this introduce unnecessary architectural complexity?**  
No. A single query helper function in `server/db.ts` is the correct location per the project's architecture.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No.

**Classification: APPROVED**  
**Approved work:** Add `findSimilarImagesByPHash(pHash: string, threshold: number, tenantId: string)` to `server/db.ts`. Implementation fetches all non-null pHash records for the tenant and filters using the existing `hammingDistance()` utility. Write targeted Vitest tests.

---

### Change 7 — P2-E2-F3: EXIF-absent flag (`exifAbsent: boolean` in `PhotoForensicsResult`)

**1. Is this genuinely required?**  
The business requirement is genuine: underwriters need a typed, queryable signal for EXIF absence rather than parsing flag strings. However, the detection logic already exists.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. `photoForensicsEngine.ts` already detects absent EXIF in three places (lines 253–258 for no EXIF object, line 261 for extraction failure, and the stripped-EXIF heuristic at lines 216–225) and appends `"SUSPICIOUS: No EXIF metadata"` to the flags array. The detection logic is complete. Only the typed boolean field is missing from `PhotoForensicsResult`.

**3. Can an existing component simply be exposed instead?**  
Yes. The detection logic already runs. Adding `exifAbsent: boolean` to the `PhotoForensicsResult` interface and setting it based on the existing `captureDateTime === null` and `fieldCount < 3` conditions is a two-line change.

**4. Is there a smaller change that achieves the same result?**  
Yes. Add `exifAbsent: boolean` to `RawAnalysisResult` in `photoForensicsEngine.ts` and set it from the existing detection logic. No new logic required.

**5. Does this introduce unnecessary architectural complexity?**  
No. Adding a typed field to an existing result type is minimal.

**6. Does this duplicate an existing KINGA capability?**  
No. The flag array entry exists, but a typed boolean field does not.

**7. Does this violate any platform principles?**  
No.

**Classification: SIMPLIFY**  
**Approved work:** Add `exifAbsent: boolean` to `RawAnalysisResult` in `photoForensicsEngine.ts`. Set it to `true` when `captureDateTime === null` AND `fieldCount < 3` (consistent with the existing stripped-EXIF heuristic). No new detection logic. Write two targeted tests.

---

### Change 8 — P2-E2-F4: AI-generated image detection (`aiGenerationScore`, `aiGenerationFlag`)

**1. Is this genuinely required?**  
Yes. Detecting AI-generated vehicle photos is a genuine fraud-prevention requirement that is not currently addressed by the EXIF/manipulation heuristics in the existing engine.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The existing `runAiVisionAnalysis()` function in `photoForensicsEngine.ts` already makes an `invokeLLM` vision call and returns a damage description, non-vehicle classification, and crush depth estimate. However, it does not ask the model to assess AI generation. The infrastructure (vision call, `invokeLLM`, `image_url` content type) is already in place and proven.

**3. Can an existing component simply be exposed instead?**  
Partially. The existing vision call can be extended to include an AI-generation assessment question in the same prompt, avoiding a second LLM call per photo. This is the correct approach: extend the existing `runAiVisionAnalysis()` function rather than adding a separate AI-generation detection pass.

**4. Is there a smaller change that achieves the same result?**  
Yes. Extend the existing `runAiVisionAnalysis()` prompt to include AI-generation assessment criteria (unnatural reflections, impossible geometry, texture artefacts, missing shadows). Parse the `aiGenerationScore` from the same response. Add `aiGenerationScore: number` and `aiGenerationFlag: boolean` to `RawAnalysisResult`. Set `aiGenerationFlag = true` when `aiGenerationScore >= 0.7`. This adds no additional LLM calls.

**5. Does this introduce unnecessary architectural complexity?**  
The proposed implementation (separate LLM call) would double the vision API cost per photo. Extending the existing call is architecturally cleaner and cheaper.

**6. Does this duplicate an existing KINGA capability?**  
The separate-call approach would duplicate the existing vision call infrastructure. The extension approach does not.

**7. Does this violate any platform principles?**  
No, provided the extension approach is used.

**Classification: APPROVED (with mandatory implementation constraint)**  
**Approved work:** Extend the existing `runAiVisionAnalysis()` prompt in `photoForensicsEngine.ts` to include AI-generation assessment. Parse `aiGenerationScore` from the existing response. Add `aiGenerationScore: number` and `aiGenerationFlag: boolean` to `RawAnalysisResult`. **Do not add a second LLM call.** Write targeted tests.

---

### Change 9 — P2-E2-F5: Vehicle Verification Report template

**1. Is this genuinely required?**  
Yes. A printable, auditable report summarising photo forensics results for a pre-insurance submission is a genuine business requirement. No equivalent report exists in the current `reportDefinitions.ts` registry.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The report registry contains claim-context reports (damage assessment, fraud analysis, settlement) but no pre-insurance verification report. The report infrastructure (`reportQueue.ts`, `kingaDesignSystem.ts`, `reportDefinitions.ts`) already exists and must be reused.

**3. Can an existing component simply be exposed instead?**  
No. A new report template is required. However, the template must use `kingaDesignSystem.ts` primitives exclusively and register via `reportDefinitions.ts`.

**4. Is there a smaller change that achieves the same result?**  
The proposed scope (vehicle identity, submission metadata, EXIF analysis, GPS analysis, manipulation score, pHash, cross-submission similarity, AI-generation score, risk summary) is appropriate for an underwriting decision document. No reduction is warranted.

**5. Does this introduce unnecessary architectural complexity?**  
No. Adding a new template to the existing report registry is the standard extension pattern.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No, provided `kingaDesignSystem.ts` is used exclusively.

**Classification: APPROVED**  
**Approved work:** Create `server/reporting/vehicleVerificationReport.ts` using `kingaDesignSystem.ts` primitives. Register with key `agency.vehicle_verification` in `reportDefinitions.ts`. Write targeted tests.

---

### Change 10 — P2-E2-F6: Vehicle Valuation Report template

**1. Is this genuinely required?**  
Yes. A printable valuation report for customer use in insurance applications is a genuine business requirement. No equivalent report exists in the current registry.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
No. The report registry does not contain a vehicle valuation report. The infrastructure exists and must be reused.

**3. Can an existing component simply be exposed instead?**  
No. A new template is required.

**4. Is there a smaller change that achieves the same result?**  
The proposed scope (vehicle identity, valuation date, market value P25/P50/P75, benchmark source, condition, mileage) is appropriate. No reduction is warranted.

**5. Does this introduce unnecessary architectural complexity?**  
No.

**6. Does this duplicate an existing KINGA capability?**  
No.

**7. Does this violate any platform principles?**  
No, provided `kingaDesignSystem.ts` is used exclusively.

**Classification: APPROVED**  
**Approved work:** Create `server/reporting/vehicleValuationReport.ts` using `kingaDesignSystem.ts` primitives. Register with key `agency.vehicle_valuation` in `reportDefinitions.ts`. Write targeted tests.

---

### Change 11 — P2-E3-F1: Expose `generateVehicleValuation()` as `agency.getValuation` tRPC procedure, with `valuationDate` parameter added to the engine

**1. Is this genuinely required?**  
Yes. Both the procedure exposure and the `valuationDate` parameter are genuinely required. An agency underwriter must be able to request a valuation anchored to a specific date — for example, to produce a pre-insurance certificate reflecting the vehicle's market value as of the policy inception date rather than the current date. Without date scoping, the engine always returns the most recent market data, which may not match the date on the policy document.

**2. Does an existing KINGA implementation already satisfy this requirement?**  
Partially. `server/insurance/valuation-engine.ts` already exports `generateVehicleValuation(request: VehicleValuationRequest)` and returns a complete `VehicleValuationResult`. The engine is not currently exposed via any tRPC procedure accessible to the `agency` role, and its `VehicleValuationRequest` type does not include a `valuationDate` field.

Critically, the `vehicleMarketValuations` table in `drizzle/schema.ts` (line 3422) already contains a `valuationDate timestamp` column (line 3454) and a `validUntil timestamp` column (line 3455). The schema infrastructure for date-scoped market data is therefore already in place. The only changes required are: (a) add `valuationDate?: Date` to `VehicleValuationRequest`; (b) pass it as an upper-bound filter on `valuationDate` in the `getMarketValuation()` helper; and (c) apply the same upper-bound filter on `claims.createdAt` in `getClaimsBasedValuation()`. No schema migration is required.

**3. Can an existing component simply be exposed instead?**  
No. A new `agency.getValuation` tRPC procedure is required to expose the engine to the agency role. The engine modification is additive and does not affect any existing callers, as `valuationDate` is an optional parameter that defaults to the current date when omitted.

**4. Is there a smaller change that achieves the same result?**  
No. The three changes listed above (type extension, market data query filter, claims data query filter) are the minimum required to implement date-scoped valuation correctly. Omitting any one of them would produce a partially date-scoped result that could mislead an underwriter.

**5. Does this introduce unnecessary architectural complexity?**  
No. Adding an optional parameter to an existing function with a sensible default (`new Date()`) is a non-breaking, additive change. The `vehicleMarketValuations` table already stores `valuationDate`, so no new concepts are introduced.

**6. Does this duplicate an existing KINGA capability?**  
No. The engine exists but is not currently exposed to the agency role, and date-scoped valuation is not available anywhere in the platform.

**7. Does this violate any platform principles?**  
No. The change is additive, non-breaking, and uses existing schema columns.

**Classification: APPROVED**  
**Approved work:** (a) Add optional `valuationDate?: Date` to `VehicleValuationRequest` in `valuation-engine.ts`, defaulting to `new Date()` when omitted. (b) Pass `valuationDate` as an upper-bound filter on `vehicleMarketValuations.valuationDate` in `getMarketValuation()`. (c) Pass `valuationDate` as an upper-bound filter on `claims.createdAt` in `getClaimsBasedValuation()`. (d) Add `agency.getValuation` procedure to `server/routers/agency.ts`, guarded by `agencyProcedure`, accepting `{ make, model, year, registrationNumber?, condition?, mileage?, valuationDate? }`. Write four targeted tests: valid result without date, valid result with historical date, FORBIDDEN for non-agency caller, result with future date falls back to current data.

---

## 3. Classification Summary

| # | Backlog Item | Original Proposal | Classification | Approved Work |
|---|---|---|---|---|
| 1 | P2-E1-F1 | Update agencyProcedure guard | **ALREADY COMPLETE** | Zero — done in Epic 1 T5 |
| 2 | P2-E1-F2 | New AdminRoleAssignment.tsx + admin.assignRole | **REUSE EXISTING** | Add `'agency'` to `PLATFORM_ROLES` constant in 2 files |
| 3 | P2-E1-F3 | New CustomerLayout.tsx + /customer routes | **REUSE EXISTING** | Zero — ClaimantPortalLayout.tsx satisfies this |
| 4 | P2-E1-F4 | New customer.getCases + CustomerCaseTracking.tsx | **SIMPLIFY** | Extend ClaimantDashboard.tsx with quotation/policy tabs |
| 5 | P2-E2-F1 | pHash — new library + DB column | **SIMPLIFY** | Reuse computeThumbnailHash() from imageIntelligence.ts; add DB column only |
| 6 | P2-E2-F2 | findSimilarImagesByPHash query | **APPROVED** | New query function in db.ts using existing hammingDistance() |
| 7 | P2-E2-F3 | exifAbsent flag | **SIMPLIFY** | Add typed boolean field; reuse existing detection logic |
| 8 | P2-E2-F4 | AI-generation detection | **APPROVED** | Extend existing vision prompt; no second LLM call |
| 9 | P2-E2-F5 | Vehicle Verification Report | **APPROVED** | New template using kingaDesignSystem.ts |
| 10 | P2-E2-F6 | Vehicle Valuation Report | **APPROVED** | New template using kingaDesignSystem.ts |
| 11 | P2-E3-F1 | agency.getValuation + valuationDate engine change | **APPROVED** | Expose existing engine as one procedure; add optional `valuationDate` parameter using existing `vehicleMarketValuations.valuationDate` column |

---

## 4. Approved Epic 2 Work Package

The following is the complete, reduced work package for Epic 2 after the Architecture Freeze Review. Items are ordered by dependency.

### Task T1 — Add `'agency'` to `PLATFORM_ROLES` in `platform-user-roles.ts` and `PlatformUserRoleManager.tsx`

**Files changed:** `server/routers/platform-user-roles.ts` (1 line), `client/src/pages/PlatformUserRoleManager.tsx` (1 line)  
**Why:** The existing role assignment infrastructure does not yet include `'agency'` in its permitted role set. This is the only change needed to enable agency role assignment via the existing admin UI.  
**Tests:** Update existing tests to assert `'agency'` is accepted by `platformUserRoles.assignRole`.

---

### Task T2 — Extend `ClaimantDashboard.tsx` with quotation and policy tabs

**Files changed:** `client/src/pages/ClaimantDashboard.tsx` (extend with 2 additional tabs)  
**Why:** The existing dashboard already shows claims via `trpc.claims.myClaims`. Adding quotation and policy tabs using the existing `trpc.agency.myQuotations` and `trpc.agency.myPolicies` procedures completes the customer case tracking view without new infrastructure.  
**Tests:** No backend tests required (procedures already tested). Frontend smoke test.

---

### Task T3 — Export `computeThumbnailHash` from `imageIntelligence.ts` and integrate into `photoForensicsEngine.ts`

**Files changed:** `server/pipeline-v2/imageIntelligence.ts` (export existing function), `server/pipeline-v2/photoForensicsEngine.ts` (import and call), `drizzle/schema.ts` (add `pHash varchar(64) nullable` to `ingestionDocuments` via raw SQL)  
**Why:** Perceptual hashing infrastructure already exists in `imageIntelligence.ts`. Exporting and reusing it avoids installing a new library. The DB column is genuinely new.  
**Tests:** pHash computed and stored for a test image; two near-identical images produce Hamming distance ≤ 10.

---

### Task T4 — Add `findSimilarImagesByPHash()` to `server/db.ts`

**Files changed:** `server/db.ts` (new query function)  
**Why:** Cross-submission duplicate detection requires a query function that does not exist. Depends on T3 (pHash column must exist).  
**Tests:** Returns correct matching records; returns empty array when no similar images exist.

---

### Task T5 — Add `exifAbsent: boolean` to `RawAnalysisResult` in `photoForensicsEngine.ts`

**Files changed:** `server/pipeline-v2/photoForensicsEngine.ts` (add field, set from existing logic)  
**Why:** The detection logic already exists; only the typed boolean field is missing.  
**Tests:** `exifAbsent = true` for image with no EXIF datetime; `exifAbsent = false` for image with valid EXIF datetime.

---

### Task T6 — Extend `runAiVisionAnalysis()` in `photoForensicsEngine.ts` with AI-generation assessment

**Files changed:** `server/pipeline-v2/photoForensicsEngine.ts` (extend prompt, add fields to `RawAnalysisResult`)  
**Why:** AI-generation detection is a genuine new capability. Extending the existing vision call avoids a second LLM call per photo.  
**Constraint:** Must not add a second `invokeLLM` call. Must extend the existing `runAiVisionAnalysis()` function.  
**Tests:** `aiGenerationFlag = false` for a real photograph; `aiGenerationScore` is a number between 0.0 and 1.0.

---

### Task T7 — Create `vehicleVerificationReport.ts` and register in `reportDefinitions.ts`

**Files changed:** `server/reporting/vehicleVerificationReport.ts` (new file), `server/reporting/reportDefinitions.ts` (register key)  
**Why:** New report template required. Must use `kingaDesignSystem.ts` primitives exclusively.  
**Tests:** Report renders all sections without error; report is stored in S3 via report queue.

---

### Task T8 — Create `vehicleValuationReport.ts` and register in `reportDefinitions.ts`

**Files changed:** `server/reporting/vehicleValuationReport.ts` (new file), `server/reporting/reportDefinitions.ts` (register key)  
**Why:** New report template required. Must use `kingaDesignSystem.ts` primitives exclusively.  
**Tests:** Report renders all sections without error.

---

### Task T9 — Add `agency.getValuation` procedure to `server/routers/agency.ts` and extend `valuation-engine.ts` with `valuationDate`

**Files changed:** `server/routers/agency.ts` (one new procedure), `server/insurance/valuation-engine.ts` (additive changes to `VehicleValuationRequest` type, `getMarketValuation()`, and `getClaimsBasedValuation()`)  
**Why:** `generateVehicleValuation()` exists but is not accessible to the `agency` role. The `vehicleMarketValuations` table already has a `valuationDate` column (schema.ts line 3454), making date-scoped valuation achievable with no schema migration. The `valuationDate` parameter is optional and defaults to `new Date()`, preserving all existing behaviour.  
**Constraint:** `valuationDate` must be optional with a `new Date()` default so that no existing callers are affected. The engine changes must be purely additive.  
**Tests:** (1) Returns valid `VehicleValuationResult` without a date; (2) Returns valid result with a historical date; (3) FORBIDDEN for non-agency caller; (4) Future date falls back to current market data gracefully.

---

## 5. Work Package Comparison

| Metric | Backlog Proposal | Approved Work Package |
|---|---|---|
| New files | 5 (AdminRoleAssignment.tsx, CustomerLayout.tsx, CustomerCaseTracking.tsx, vehicleVerificationReport.ts, vehicleValuationReport.ts) | 2 (vehicleVerificationReport.ts, vehicleValuationReport.ts) |
| New tRPC procedures | 2 (admin.assignRole, customer.getCases) | 1 (agency.getValuation) |
| New routes | 3 (/admin/roles, /customer, /customer/cases) | 0 |
| New npm libraries | 1 (pHash library) | 0 |
| Engine modifications | 2 (photoForensicsEngine.ts, valuation-engine.ts) | 2 (photoForensicsEngine.ts — additive; valuation-engine.ts — additive optional param) |
| DB column additions | 1 (pHash) | 1 (pHash) |
| Schema migrations | — | 0 (valuationDate uses existing vehicleMarketValuations.valuationDate column) |
| Tasks eliminated | — | P2-E1-F1 (done), P2-E1-F3 (reuse), partial P2-E1-F2, partial P2-E1-F4, partial P2-E2-F1 |

The approved work package reduces Epic 2 from 11 backlog features to 9 tasks, eliminates 3 new files, 1 new procedure, 3 new routes, and 1 new library, while delivering the same business capability.

---

## 6. Regression Risk Assessment

| Risk | Mitigation |
|---|---|
| `photoForensicsEngine.ts` changes break existing claims pipeline | Changes are additive only (new fields, extended prompt). Existing field values are unchanged. Run `pnpm vitest run server/pipeline-v2/` after each task. |
| `ingestionDocuments` pHash column addition | Additive nullable column. No existing queries are affected. Apply via raw SQL (consistent with Epic 1 approach). |
| `imageIntelligence.ts` export change | Adding an export to an existing function is non-breaking. |
| `reportDefinitions.ts` registration | Adding a new key to the registry is non-breaking. |
| `platform-user-roles.ts` PLATFORM_ROLES addition | Adding a value to a constant array is non-breaking. Existing role assignments are unaffected. |
| `ClaimantDashboard.tsx` extension | Adding tabs to an existing page is non-breaking. Existing claims tab is unchanged. |

---

## 7. Dependency Order

```
T1 (PLATFORM_ROLES constant) — independent, can start immediately
T2 (ClaimantDashboard tabs) — independent, can start immediately
T3 (pHash integration + DB column) — independent, must precede T4
T4 (findSimilarImagesByPHash) — depends on T3
T5 (exifAbsent flag) — independent
T6 (AI-generation detection) — independent
T7 (vehicleVerificationReport) — depends on T3, T4, T5, T6 (needs all forensics fields)
T8 (vehicleValuationReport) — independent
T9 (agency.getValuation + valuationDate engine extension) — independent
```

Recommended implementation order: T1 → T2 → T3 → T5 → T6 → T4 → T7 → T8 → T9

---

## 8. Acceptance Gate for Epic 2

Before Epic 2 is considered complete, all of the following must be true:

- [ ] T1: `'agency'` is in `PLATFORM_ROLES` in `platform-user-roles.ts` and `PlatformUserRoleManager.tsx`
- [ ] T2: `ClaimantDashboard.tsx` shows quotation and policy tabs for claimant users
- [ ] T3: `computeThumbnailHash` exported from `imageIntelligence.ts`; `pHash` column exists in `ingestionDocuments`; pHash computed and stored by `photoForensicsEngine.ts`
- [ ] T4: `findSimilarImagesByPHash()` implemented in `server/db.ts` with passing tests
- [ ] T5: `exifAbsent: boolean` returned by `photoForensicsEngine.ts` with passing tests
- [ ] T6: `aiGenerationScore` and `aiGenerationFlag` returned by `photoForensicsEngine.ts` with passing tests; no second LLM call added
- [ ] T7: `vehicleVerificationReport.ts` renders all sections; registered as `agency.vehicle_verification`
- [ ] T8: `vehicleValuationReport.ts` renders all sections; registered as `agency.vehicle_valuation`
- [ ] T9: `agency.getValuation` returns valid result without date; returns valid result with historical date; FORBIDDEN for non-agency caller; future date falls back gracefully
- [ ] TypeScript error count does not exceed 47 (pre-existing baseline)
- [ ] All targeted Vitest tests pass
- [ ] No regression in existing claims pipeline tests

---

## 9. Items Explicitly Out of Scope for Epic 2

The following items from the original backlog are deferred or eliminated:

- **New `/admin/roles` route and `admin.assignRole` procedure** — eliminated. Existing `platformUserRoles.assignRole` and `PlatformUserRoleManager.tsx` satisfy the requirement.
- **New `/customer` route group and `CustomerLayout.tsx`** — eliminated. Existing `/claimant` portal satisfies the requirement.
- **New `customer.getCases` procedure** — eliminated. Existing procedures satisfy the requirement.
- **New pHash library installation** — eliminated. Existing `computeThumbnailHash()` in `imageIntelligence.ts` satisfies the requirement.

---

*End of Architecture Freeze Report — Epic 2*
