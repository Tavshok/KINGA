# KINGA Testing Manual

## 1. Test structure

KINGA uses Vitest configuration in `vitest.config.ts` and `vitest.integration.config.ts`; package scripts are declared in `package.json`. Tests are colocated across `server/`, `server/routers/`, `server/reporting/`, `server/pipeline-v2/`, `server/engineer/`, and selected client/shared areas. The repository also contains Playwright scripts (`test:e2e`) and audit/governance utilities in `scripts/`.

## 2. Commands

| Purpose | Command | Notes |
|---|---|---|
| Install dependencies | `pnpm install --frozen-lockfile` | Use the lockfile; do not silently upgrade dependencies during investigation. |
| Run full Vitest suite | `pnpm test` | Interpret failure IDs against a fresh current-main baseline; do not claim global green from a partial/OOM run. |
| Run a file | `pnpm vitest run path/to/file.test.ts` | Prefer the narrowest affected suite first. |
| Integration config | `pnpm test:integration` | Requires its configured environment; inspect config first. |
| Type check | `pnpm check` | Compare diagnostics against current-main baseline when the repository has known inherited diagnostics. |
| Server bundle | `pnpm check:server` | Exercises the server entry bundle. |
| Build | `pnpm build` | Runs Vite and server bundle; resource limits must be stated honestly. |
| Portal conformance | `pnpm test:portal` / `pnpm audit:portal` | Supports client route/import auditing. |
| End-to-end | `pnpm test:e2e` | [NOT VERIFIED IN CODEBASE AS A CURRENTLY PROVISIONED E2E ENVIRONMENT] |

## 3. Tests requiring architectural review before removal

> **DO NOT REMOVE THESE TESTS WITHOUT ARCHITECTURAL REVIEW**

| Test area | Why it is critical |
|---|---|
| `server/engineer/inspectionAuthority.p0.test.ts` | Establishes tenant, assignment and side-effect-denial expectations for engineering operations. |
| `server/routers/notificationsTenantAuthority.p0.test.ts` | Protects notification tenant isolation. |
| Quote/report tenant-authority tests | Protect object and report/export access boundaries. |
| `server/reporting/forensicReportModel.test.ts` and shared-tier consistency tests | Prevent report value drift and fabricated approval/report framing. |
| Stage 6 and evidence eligibility tests | Protect image evidence provenance, degradation and physics eligibility semantics. |
| Workflow validator/engine/integration tests | Protect allowed state changes and workflow governance. |

## 4. Fixture and baseline discipline

Use uniquely stamped/owned records. Capture the IDs that setup created, and delete only those IDs in foreign-key-safe order in an `afterAll`/equivalent teardown that runs even if setup is partially unsuccessful. Never use `SELECT ... LIMIT 1` to obtain a record for mutation. Tests that touch tenant data must prove foreign-tenant denial and no forbidden side effect where relevant.

The full suite has exhibited inherited variability and environment-dependent failures in prior validation. Therefore, record exact failing identifiers for a fresh current-main worker baseline and compare branch results to it. A resource timeout, missing DB, OOM or incomplete Vite chunk rendering is not a pass and must not be presented as one.
