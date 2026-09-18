# KINGA Quality Gate: Current-Main Dry Run

**Date:** 18 September 2026
**Commit tested:** `ab1adcc11b564e131dc1c98bb8f99f7566d6c1e0` (current GitHub `main` at the time)
**Purpose:** Owner-authorized dry run of the proposed quality-gate commands before opening any CI workflow review PR.
**Outcome:** **Do not open the CI workflow PR yet.** The full test suite is currently red and must be consciously resolved or handled through a separately approved temporary policy; it must not be made non-blocking silently.

## Results

| Gate | Command | Result |
|---|---|---|
| Dependency integrity | `pnpm install --frozen-lockfile` | Passed. |
| Merge hygiene | `pnpm run check:conflicts` | Passed. |
| Full test suite | `pnpm test` | Failed. |

The full suite completed in approximately **184 seconds**.

| Test result | Count |
|---|---:|
| Passing test files | 489 |
| Failed test files | **63** |
| Skipped test files | 2 |
| Passing tests | 9,082 |
| Failed tests | **112** |
| Skipped tests | 181 |

## Failure concentration

The 112 assertion failures span 63 files; they are not confined to one narrow historical test. The largest groups are below.

| Area | Failed assertions | Representative current failure mode |
|---|---:|---|
| Role-assignment audit | 19 | Existing audit expectations are out of alignment with current behavior. |
| WhatsApp signature boundary | 15 | The isolated WA-SEC tests pass, but full-suite shared mock/server state leaves request results undefined. |
| Approval tracking | 14 | Existing workflow/lifecycle expectation failures. |
| Reporting surfaces | 14 across 10 reporting files | Cross-surface report/readiness/L1-L2/legacy-history assertions are stale or divergent. |
| Analytics router | 5 | KPI and critical-alert expectations fail. |
| Portal conformance | 5 | Existing portal conformance assertions fail. |
| Dataset-capture activation | 4 | Existing activation expectations fail. |
| Runtime maintenance/probes | 6 across three files | Existing route-composition/readiness expectations fail. |
| Tenant/role/session authority and other domain suites | Remaining failures | Includes tenant isolation, session revocation, agency/fleet/panel-beater authority, claims, documents, evidence, and workflow suites. |

Two specific observations are relevant to prioritization:

1. `server/auth.logout.test.ts` expects `sameSite: "none"`, but the current code returns `sameSite: "lax"` in the test context. This is a real expectation/runtime-policy mismatch, not a reason to suppress the test.
2. The full-suite WhatsApp failures do not invalidate the isolated WA-SEC security proof by themselves: the specific WorkOS-independent focused WhatsApp tests previously passed in isolation, while the full run shows shared test-process/mocking isolation issues that should be diagnosed rather than ignored.

## TypeScript baseline

The proposed workflow’s TypeScript policy remains appropriate but separate from the test problem. The current exact-main check reports **998 inherited diagnostics**. A future baseline comparator may report those diagnostics while failing on any newly introduced diagnostics. That does not make full test failures acceptable: the proposed workflow must still fail whenever `pnpm test` fails until the owner approves a different, explicit policy.

## Decision required before CI implementation

| Option | Consequence |
|---|---|
| **Repair test debt first** | Diagnose and repair the failing suites in bounded packages, then implement a genuinely blocking quality gate. This is the recommended path. |
| **Approve a temporary, explicit exception policy** | Design a narrowly bounded baseline/allowlist only after reviewing exact failure classes. The policy must remain visible, expire, and reject new failures; it must not use a blanket `continue-on-error`. |
| **Defer CI workflow** | No workflow source or branch protection is added now. |

No GitHub Actions workflow, branch-protection rule, repository setting, deployment, database change, or application code change was made by this dry run.
