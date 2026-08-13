# R0 Cross-Report Acceptance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Approval required before implementation

## Objective

Create deterministic same-snapshot fixtures and acceptance tests proving that the Claims Ledger (CL), Claims Intelligence (CI), Forensic Decision Report (FR), and the top-of-report client view all present the same quote evidence, L2 state, and financial decision boundary.

## Canonical Fixture States

| State | Submitted quote evidence | Required L2 presentation | Financial boundary |
|---|---|---|---|
| No quote | No active quotation | `unavailable`; no invented estimate or assessor-cost substitution | No savings or settlement output |
| Total-only quote | One or more active quote headers but no priced repair scope | Quote receipt visible; `incomplete_scope`; L1 header comparison remains visible | No L2 total, savings, or settlement output |
| Incomplete itemised scope | Active itemised rows leave one or more required repair components unresolved | Evidence-qualified partial comparison and named gap; `incomplete_scope` | No final L2, savings, or settlement output |
| Complete all-in scope | Active, duplicate-filtered, itemised source rows cover the payable repair scope on a defined basis | Complete L1/L2 comparison, active quote ledger, and benchmark comparison displayed distinctly | Savings and settlement recommendation may be shown only if ordinary workflow conditions also permit them |

## Scope

The package will add a shared fixture builder and use it to validate the cost resolver, decision resolver, CL renderer, CI renderer, FR renderer, and `KingaClaimsReport` top cost view. Each test will use one immutable in-memory snapshot. It will verify labels, quote counts, active amounts, hold reasoning, absence of fabricated values, and allowed/disallowed financial outputs.

No production claim, quotation, assessment, report job, payment, settlement, or user record will be modified. This package introduces test fixtures and renderer/UI acceptance coverage only.

## Acceptance Criteria

1. All four fixture states produce one consistent typed cost and decision contract across CL, CI, FR, and the top view.
2. Duplicate or superseded quotes cannot appear as active ledger rows or influence L1/L2/savings.
3. Incomplete states never show a payable L2 amount, savings figure, settlement recommendation, or stale approval.
4. The complete state shows only submitted active quote values for L1/L2, retains benchmarks as comparison evidence, and shows assessor cost only as calibration/comparison.
5. Focused regressions, bundled server build, and Vite production build pass.
