# SAR Tenant Isolation — P0 Closure Record

**Branch:** `fix/sar-tenant-isolation`  
**Base:** `cb59e1355967b17fca0f95173343b925c854d318`  
**Scope:** Existing SAR data isolation only. No new jurisdictional disclosure, retention, redaction, consent, DSR workflow, or legal-policy behaviour was introduced.

## Data-path correction

The reporting router already resolves `tenantId` from the authenticated session through `resolveP0TenantScope()` before dispatching `governance.sar`. The SAR generator accepted that tenant parameter but previously ignored it.

The corrected SAR query now has three mandatory boundaries:

| Boundary | Implemented condition | Effect |
|---|---|---|
| Server-resolved tenant | The generator rejects a missing/blank `tenantId` before opening a connection. | A direct service caller cannot obtain a global SAR by omitting tenant scope. |
| Claim discovery | `WHERE c.claimant_id=? AND c.tenant_id=?` | Subject matching is constrained to the authenticated request tenant. |
| Assessment join | `LEFT JOIN ai_assessments a ON a.claim_id=c.id AND a.tenant_id=c.tenant_id` | A related assessment must carry the same tenant scope as its authorised parent claim. |

The SAR renderer uses only the selected claim/assessment projection. It performs no later document, vehicle, quotation, audit, or related-record query, so no further SAR data-access path exists in the current implementation.

## Live TiDB regression coverage

`server/reporting/sarTenantIsolation.p0.test.ts` creates one owned claimant and three captured claims: two in tenant A and one in tenant B. The same claimant ID is intentionally used on both tenant scopes to prove that a tenant predicate—not claimant identity alone—controls disclosure.

| Scenario | Expected result | Result |
|---|---|---|
| Tenant A requests the shared claimant | Both tenant-A claim incident types render. Tenant-B claim type, VIN, and high-cost assessment value do not render. | Passed. |
| Non-matching tenant requests the claimant | The SAR contains only the existing empty-data response and no tenant-A or tenant-B evidence. | Passed. |
| Direct SAR generator call omits server-resolved tenant | Fails closed with `A tenant-scoped SAR request is required.` | Passed. |
| Static contract guard | The SAR query retains `c.tenant_id=?`, contains the fail-closed message, and no longer includes the old ignored `_tenantId` parameter. | Passed. |

Fixture teardown deletes captured `ai_assessments` IDs, then captured `claims` IDs, then the captured user ID. Post-delete no-leak queries assert zero rows for the exact captured IDs.

## Validation

| Check | Result |
|---|---|
| SAR isolation and reporting contract tests | **2 files; 5/5 passed** against live TiDB. |
| Bundled server build | Passed. |
| Vite production build | Passed; existing bundle-size warnings only. |
| Complete configured server/shared test suite | 41 isolated fresh-worker shards completed on branch and exact parent baseline. **45 shared failure identifiers; 0 branch-only; 0 baseline-only.** |
| Server/shared TypeScript partition | Branch diagnostics exactly matched parent baseline after normalising worktree paths. No diagnostic referenced the SAR generator or its new regression. |

## Deliberately unchanged

The patch does not decide what a SAR should disclose, redact, retain, export, or validate under any jurisdiction. It only ensures the already-existing SAR output is derived from records belonging to the authenticated request tenant.
