# Phase 4 — Vehicle Passport Presentation and Pagination Validation

## Scope and safety boundary

This branch standardises how pre-loss Vehicle Passport evidence is presented across the tenant-scoped claim reports and narrows the print-pagination rules so they support table continuation without changing claim data, quotation data, workflow, evidence provenance, schema, migrations, provider configuration, or any L1/L2/savings/settlement decision rule.

## Presentation change

Claims Report, Claims Intelligence Report, and Forensic Report now render the same shared `renderVehiclePassportEvidencePanel` output for qualifying pre-loss snapshots. The shared panel is explicitly neutral and source-bounded. It labels the section as **Vehicle Passport — Pre-Loss Condition Evidence**, adds a dated-source marker, and retains the existing evidence-boundary statement that the snapshot does not determine causation, repair cost, policy, premium, settlement, fraud conclusion, or claim outcome.

The shared renderer accepts both the canonical resolved camel-case snapshot shape and the legacy snake-case snapshot shape for display compatibility only. It does not infer or backfill missing fields.

## Pagination change

The shared report print CSS now repeats table headers in print and allows large tables to continue naturally across pages while still avoiding broken short-form text fragments. The key print changes are:

| Rule | Purpose |
|---|---|
| `thead { display: table-header-group; }` | Repeats table headers on continuation pages |
| `tfoot { display: table-footer-group; }` | Preserves footer semantics for printable tables |
| `table { break-inside: auto; page-break-inside: auto; }` | Avoids forcing whole long tables onto sparse pages |
| `.vehicle-passport-evidence { break-inside: avoid-page; }` | Keeps the neutral Vehicle Passport evidence panel together where practical |
| paragraph/list/callout row avoidance retained | Prevents short narrative fragments at page breaks |

## Behavioural validation

| Check | Result |
|---|---|
| Shared Vehicle Passport unit regression | 2/2 passed |
| Cross-report legacy/active quote parity plus Vehicle Passport parity | 3/3 passed |
| CI print-pagination regression | 1/1 passed |
| CI quote-state regression | 2/2 passed |
| Agency evidence-boundary regression | 6/6 passed |
| Combined focused Phase 4 suites | 5 files, 14 tests passed |
| Production build | Passed |
| TypeScript same-base comparison | Current main: 999 inherited diagnostics; branch: 999 inherited diagnostics; no new touched-path category |
| Full suite same-base comparison | Current main and branch each: 28 failed files, 54 failed tests, 9,252 passed, 3 skipped; identical failing identifiers |

## A4 fixture evidence

The branch generated a self-contained Chromium A4 fixture at `/tmp/kinga-phase4-passport-pagination/phase4-passport-pagination.pdf` using the actual shared report CSS and shared Vehicle Passport renderer. The fixture produced **5 A4 pages**.

Visual inspection confirmed:

| Page | Verified finding |
|---|---|
| Page 1 | The shared green section tab is followed immediately by the neutral Vehicle Passport panel. The section is populated with snapshot number, date, recorded condition, odometer, pre-existing notes, and the boundary disclaimer. No blank opening page occurred in the fixture. |
| Pages 2–4 | The long evidence ledger continues across pages with the table header repeated at the top of each continuation page. |
| Page 5 | The final page remains populated through ledger rows 119 and 120, proving continuation reaches the final page rather than truncating at the visible viewport. |

Text extraction from the fixture confirmed a populated first page (`1673` non-whitespace characters) and a populated final page (`238` non-whitespace characters).

## Remaining acceptance boundary

This branch validates the shared HTML/CSS and renderer behaviour in isolation. Authorised post-publication portal observation is still required to confirm that the specific live CI and FR claim views no longer show the earlier blank-first-page / portal-control print artefacts and that the revised Vehicle Passport section appears correctly within the authenticated UI.
