# Report Export Security Hardening — P0 Closure Record

**Branch:** `fix/report-export-and-shadow-security`
**Base revision:** `cb59e1355967b17fca0f95173343b925c854d318`
**Scope:** Only the unauthenticated audit-export REST route and globally unscoped Shadow observations/reports.
**Excluded:** SAR, legacy PDF generation, placeholder downloads, governance metrics, CL/CI/FR, schema or migrations, and unrelated application paths.

## 1. Audit export REST endpoint

| Requirement | Implemented mechanism | Regression evidence |
|---|---|---|
| Require a valid session | The Express route calls the established `sdk.authenticateRequest(req)` before reading or exporting a claim. Authentication failure returns `401` and stops processing. | `audit-export-route.test.ts`: unauthenticated request returns `401`; the export generator mock has zero calls. |
| Derive the tenant from the session | The route accepts no tenant parameter and passes only `ctx.user.tenantId` to `requireGovernedTenantClaim`. | The tenant-A caller cannot request the tenant-B fixture claim; response is `404`, and the export generator mock has zero calls. |
| Enforce claim authority before export | `requireGovernedTenantClaim` selects the exact claim under the session-derived tenant. The same helper continues to be used by AI assessment procedures. | The same test uses real TiDB tenant-A and tenant-B claim rows. |
| Preserve valid output | After successful authority validation, the route sends the exporter result unchanged and preserves its `payload_hash` response header. | The tenant-A test receives the exact payload supplied by the exporter seam and verifies the exact ID forwarded to the exporter. |

The route integration test uses a controlled authentication callback to exercise all HTTP outcomes deterministically while using the **real governed-claim helper and live TiDB fixture rows**. It does not mint or bypass a production OAuth session; production route registration supplies the established SDK authentication function unchanged.

## 2. Shadow reports and observations

The Shadow generator is intentionally platform-wide: it aggregates `shadow_observations`, governance logs, override records, and related observations without a tenant filter. The codebase did not establish an approved tenant-scoped product contract for that aggregate. Accordingly, the safer interim authority model is **platform-super-admin only**.

| Procedure | New authority | Purpose preserved |
|---|---|---|
| `aiAssessments.getShadowObservation` | `superAdminProcedure` | Platform-wide observation lookup. |
| `aiAssessments.getAllShadowObservations` | `superAdminProcedure` | Platform-wide observation list. |
| `aiAssessments.generateShadowReport` | `superAdminProcedure` | Observation-only role report. |
| `aiAssessments.generateAllShadowReports` | `superAdminProcedure` | Observation-only cross-role overview. |

`superAdminProcedure` requires an authenticated `platform_super_admin` session. Ordinary authenticated tenant users now receive `FORBIDDEN` before generator or observation data access. Platform super administrators retain the existing observation-only global oversight capability. A future tenant-scoped Shadow product would require a separately approved data model and aggregate semantics; this patch neither infers nor creates one.

## 3. Live-database and build validation

| Check | Result |
|---|---|
| REST audit-export authority suite | `audit-export-route.test.ts`: **3/3 passed**. |
| Shadow report authority suite | `shadow-report-authority.p0.test.ts`: **3/3 passed**; includes ordinary-user denial and platform-super-admin generation/list success against live TiDB. |
| Combined P0 regression run | **2 files; 6/6 tests passed**. |
| Bundled server build | Passed. |
| Vite production build | Passed. |
| Complete configured server/shared test inventory | **492 files**, 41 isolated fresh-worker shards. Branch and exact-base baseline each yielded **45 failed identifiers: 45 shared, 0 branch-only, 0 baseline-only**. |
| Server/shared TypeScript partition | 929 inherited diagnostics; none references `audit-export-route`, `governedClaimAuthority`, `ai-assessments-core`, or `shadow-report-authority`. This is not a global TypeScript-green claim. |

## 4. Change boundaries

The security branch adds a reusable `server/services/governedClaimAuthority.ts` module by extracting existing governed-claim logic from `ai-assessments-core.ts`. This preserves the same tRPC claim-authority semantics for the AI procedures while allowing the REST endpoint to use that authority without duplicating access logic. The only modified runtime entry point is the audit export route in `server/_core/index.ts`; the only modified report router is the four Shadow procedures listed above.
