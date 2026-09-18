# CI Reporting Expectation Reconciliation

**Date:** 18 September 2026
**Package:** CI-RPT-01
**Scope:** Seven independently traced reporting-test corrections. No report-renderer, shared-cost, database, schema, authentication, WhatsApp, provider, or deployment source is changed.

## Decision method

Each former failure was investigated separately against its current source contract, isolated test result, and Git history. The package changes only an expectation where the test had drifted after a deliberate refactor or validation hardening. It does not alter a product contract to accommodate a test.

| Test                        | Failure origin                                                                                                 | Minimal correction                                                                                     | Authority |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| Claim audience disclosure   | Refactor moved the actual route component into `ClaimDecisionReport.page.tsx`; the old file is an export shim. | Read the real page module.                                                                             | Test      |
| Report readiness rendering  | Forensic model resolution correctly closes a fourth scoped connection.                                         | Remove the irrelevant fixed close-count assertion.                                                     | Test      |
| L2 selection trace          | Same stale close count; a positive write-off fixture lacked required `writeOffWarning`.                        | Remove topology count and make the fixture valid.                                                      | Test      |
| Legacy quotation history    | Centralized presenter replaced both copy and the previous inline access shape.                                 | Assert executable legacy-versus-active behavior and current qualified copy.                            | Test      |
| R0 cross-surface cost strip | Deliberate renderer centralization removed duplicated call-site labels; hold wording became more specific.     | Retain delegation and behavior checks; assert the current hold semantic.                               | Test      |
| R1 display                  | Fixed per-renderer label probes became obsolete after centralization.                                          | Exercise the real shared presenters with controlled complete, incomplete, and reconciliation fixtures. | Test      |
| Shared report fields        | `incomplete_scope` had been intentionally differentiated from reconciliation-required.                         | Assert the current incomplete-scope message.                                                           | Test      |

## Safety coverage retained

The revised tests still protect the substantive system behavior:

- claimant output omits benchmark mechanics while professional output retains them;
- non-ready assessment states remain visible and cannot be represented as completed assessment intelligence;
- a complete L2 retains traceability and explicit evidence notices, while incomplete/no-eligible states cannot become a payable recommendation;
- the strict persisted write-off recommendation guard remains in force and an L2 display never authorizes settlement;
- legacy quotation rows remain history rather than active comparison evidence, with no L1 fallback;
- complete, incomplete, and reconciliation-required L2 states preserve no-fabrication, no-savings, and no-settlement boundaries; and
- Claims Ledger, Claims Intelligence, and Forensic reports still render identical canonical decision, fraud, market-value, and cost-state output from the same fixtures.

## Verification

All seven former failure files now pass together under the repository’s mocked test environment:

```text
Test Files  7 passed (7)
Tests       26 passed (26)
```

An independent review found no required correction and confirmed that the only changes are the seven test files. The next required action is the user-authorized full-suite run, which will determine whether these targeted corrections expose any additional failures before branch protection is enabled.
