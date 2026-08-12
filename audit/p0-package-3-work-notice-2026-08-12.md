# P0 Package 3 Work Notice — Executive Decision-Data Integrity

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Proposed work only — implementation requires explicit approval  
**Source finding:** `AUD-017` in the full-platform functional audit

## Purpose

This package removes reachable mock operational claim and override data from the Executive Dashboard drill-down. Executive users must either see authorised, tenant-scoped records derived from live data or an explicit unavailable/empty state. They must never see fabricated claim identifiers, policyholders, amounts, fraud scores, routing histories, or override events presented as operational facts.

> A decision dashboard must fail visibly when authoritative data is absent; it must not fill the gap with demonstration records.

## Requested implementation boundary

| Workstream | Exact change | Required outcome |
|---|---|---|
| **P3-A — Remove mock operational payloads** | Delete or isolate `mockClaims` and `mockOverrideHistory` from every reachable executive runtime path. | No rendered executive drill-down contains hard-coded customer, claim, financial, risk, or override records. |
| **P3-B — Authoritative data contract** | Add one tenant-derived, role-authorised procedure for executive claim drill-down data, including only the fields with an actual source. | The client cannot nominate another tenant or supply arbitrary claim IDs to fetch decision data. |
| **P3-C — Explicit unavailable state** | When no authorised claim, workflow history, or override data exists, render a clear unavailable or empty state; do not invent values, labels, scores, or timelines. | The dashboard remains usable and honest under incomplete data. |
| **P3-D — Super-admin policy** | Reuse the explicit tenant-selection and audit pattern from P0 Package 1 for platform-super-admin testing. | Cross-tenant platform testing is deliberate, selected, and auditable; ordinary executive users remain tenant-bound. |
| **P3-E — Regression proof** | Add two-tenant, no-mock-data, authorised-detail, unavailable-state, and super-admin audit tests. | A foreign tenant’s records cannot appear, mock values cannot re-enter the component, and legitimate same-tenant detail loads correctly. |

## Explicitly outside this package

This package will not change executive KPI formulas, report generation, claim workflow decisions, fraud models, pricing, notifications, role design, external integrations, or historical claim data. Marketing metrics (`AUD-007`) and separate dashboard design work remain separate controlled packages.

## Non-negotiable invariants

| ID | Invariant |
|---|---|
| EXE-01 | No executive-facing decision record may originate from a static mock array, placeholder fixture, or unscoped client state. |
| EXE-02 | Tenant scope is derived from the session; only the audited platform-super-admin exception may select an alternative tenant. |
| EXE-03 | Missing data renders a named unavailable/empty state rather than a fabricated score, history, amount, or claimant. |
| EXE-04 | A detail request is authorised against both the tenant scope and the underlying claim/object relationship. |
| EXE-05 | Every super-admin cross-tenant drill-down creates a persisted audit event. |

## Required acceptance evidence

| Scenario | Expected result |
|---|---|
| Executive in Tenant A requests Tenant A claim | Authorised live-backed detail or explicit unavailable state. |
| Executive in Tenant A requests Tenant B claim | Denied; no field is disclosed. |
| Tenant has no history or override records | Explicit empty/unavailable presentation, with no demo data. |
| Platform-super-admin selects Tenant B deliberately | Authorised only with explicit selection and an audit record. |
| Source scan and rendered component | No `mockClaims`, `mockOverrideHistory`, fictional policyholder, or invented financial/risk data reaches the active UI. |
| Regression and build | Focused tests, bundled server build, and Vite build pass. |

## Release decision

Completion requires a source and runtime regression proving that the active dashboard no longer renders mock operational records, plus tenant-negative and same-tenant positive coverage. The package will not be described as complete merely because the mock array is deleted.

## Runtime observation during implementation

On 12 August 2026, the published Executive Dashboard route was visited without changing data or authentication state. The browser rendered a blank page with no interactive elements, so it did not provide a role-authenticated E4 acceptance result. This is recorded as an environmental/runtime limitation for Package 3 rather than evidence that the new authorised detail path has been executed in production. Deterministic router and source-scan evidence remains required, and an authenticated Executive or explicit platform-super-admin tenant-selection session remains the final browser acceptance prerequisite.
