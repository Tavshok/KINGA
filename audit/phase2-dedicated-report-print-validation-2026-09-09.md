# Phase 2 — Dedicated Report Print Document Validation

**Scope.** This record validates the browser-print boundary for the iframe-backed Claims Intelligence and Forensic report documents. It does not validate authenticated portal controls or modify any claim, quotation, workflow, L1/L2 calculation, evidence, schema, or production record.

| Validation | Result | Evidence |
|---|---|---|
| Shared print routing behaviour | Pass | `server/reporting/reportDocumentPrinting.p1.test.ts`: 4/4 tests passed. The suite proves that standard Claims Reports retain direct printing, CI/FR route to their own document, an unavailable embedded report does not fall back to portal printing, and popup blocking is surfaced as a failure. |
| CI/FR report document isolation | Pass | Existing chrome-isolation regression passed 18/18, confirming server-rendered reports have a complete document wrapper and no application navigation, shell, or Vite runtime markers. |
| CI pagination and evidence safeguards | Pass | CI pagination and quote-state regressions passed 3/3; mixed-currency and legacy evidence continue to withhold unsupported L1/L2, savings, and settlement values. |
| Forensic model/regression coverage | Pass | Forensic model regression passed 6/6, including cross-tier field parity and tenant denial. |
| Chromium A4 fixture | Pass | A saved direct-document fixture generated a 3-page A4 PDF. `pdfinfo` reported three A4 pages; extracted text and visual review confirmed content on pages 1, 2, and 3, including the opening and closing markers. |
| Isolated branch browser bootstrap | Pass | The Phase 2 development server loaded the KINGA public homepage in a fresh browser session without a client runtime error. Authenticated CI/FR controls were not available in this session. |
| Final production build | Pass | Vite completed in 26.08 seconds and the server bundle completed in 199 ms. The output contains stable `index.js`, `Home.js`, and server `dist/index.js` assets. |
| TypeScript baseline comparison | No new debt | Current GitHub main and the branch each produced 999 existing diagnostics; the branch introduced no new error-code category and no diagnostic in a Phase 2 implementation path. |
| Full-suite baseline comparison | No branch regression | Current GitHub main: 28 failed files, 502 passed files; 54 failed tests, 9,246 passed, 3 skipped. Final branch: 28 failed files, 502 passed files; 54 failed tests, 9,249 passed, 3 skipped. The failing test identifiers were identical; the three additional passing tests are the new print-contract coverage. |

The fixture deliberately prints a complete copied report document, not the portal parent or an iframe. It demonstrates the intended architecture removes the blank parent page and visible-viewport limitation under Chromium. It is **not** an authenticated CI/FR production acceptance result; that remains a post-publication user or authorised-session check.
