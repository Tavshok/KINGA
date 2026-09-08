# Package A — Report Provenance and Cost-Evidence Assessment

**Claim reference:** `DOC-20260810-84080652`
**Assessment scope:** Read-only provenance, deployment-drift, and artefact review
**Prepared:** 8 September 2026
**Boundary:** No source code, database record, report artefact, workflow state, quote, retry, or production setting was changed.

## Conclusion

The three supplied PDFs were created in the browser on 8 September 2026, **after** the canonical report-tier migration was merged on 31 August 2026. Their report-quality findings must therefore be treated as current produced-output behaviour, rather than assumed pre-migration artefacts.

The assessment could not use the requested governed tenant-scoped claim path because browser access was not available. It deliberately did **not** substitute a raw or unscoped production query. Consequently, the canonical ledger rows, individual quote eligibility, line-item completeness, report-queue metadata, and reconciliation records for this claim remain **not independently verified**. This is an evidence limit, not a claim that the data is absent.

Two artefact findings are nevertheless confirmed from the supplied PDFs and the current source tree:

1. All three PDFs lack a usable active-quote, side-by-side, line-item comparison and withhold a final L2 value. The forensic report explicitly states that final L2 is held because evidence is incomplete/reconciliation remains required; that hold must be preserved.
2. `Vehicle passport unavailable — inArray is not defined` is a **current source defect**, not merely an unknown legacy bundle error. `server/routers/vehicle-passport.ts` calls `inArray(...)` at line 91, but its `drizzle-orm` import list does not import `inArray`.

## 1. Timing and report-version provenance

| PDF | Embedded creation time (UTC) | Pages | Canonical migration comparison | Finding status |
|---|---:|---:|---|---|
| CL (`…cl1.pdf`) | 2026-09-08 10:40:51 | 7 | After the migration | Current generated artefact |
| CI (`…ci2.pdf`) | 2026-09-08 10:40:13 | 4 | After the migration | Current generated artefact |
| FR (`…fr.pdf`) | 2026-09-08 10:38:46 | 11 | After the migration | Current generated artefact |
| Canonical report-tier migration | 2026-08-31 15:22:06 UTC | — | `40b7514e41b7e6c57cb3251ce7fdbd4e3236c37b` | Merged before all three PDFs |

The PDFs report Chrome as their creator and Skia/PDF as their producer. This establishes that these copies were browser-generated/printed on 8 September; it does **not** embed the report-server Git SHA or report-queue job ID. The document-reference date (`20260810`) is not a substitute for the browser creation timestamp.

### Implications

* The blank CI first page, incorrect CI page-footing/print behaviour, missing usable cross-quote matrix, and L2 withholding are not dismissed as pre-canonical-migration reports.
* The artefacts cannot prove the exact report renderer commit. A report-queue record, report job metadata, or server build SHA would be required to make a commit-level provenance statement.

## 2. Deployment/build-drift assessment

### The `inArray` Vehicle Passport error

All supplied reports contain the Vehicle Passport fallback and the error text `inArray is not defined`. The current source contains no literal `nArray` identifier; the correct captured error token is **`inArray`**.

The current `server/routers/vehicle-passport.ts` imports `eq`, `and`, `sql`, `desc`, `count`, `avg`, `sum`, `max`, and `isNotNull` from `drizzle-orm`. It then calls:

```ts
inArray(agencyInsuranceServiceRequestInsurers.status, ["invited", "viewed", "responded"])
```

at line 91 without importing `inArray`. That is an executable current-source failure path. The report-panel fallback in `client/src/components/VehiclePassportPanel.tsx` displays the received error message, explaining why it appears in each PDF.

| Question | Evidence-led answer |
|---|---|
| Is the PDF error only a stale bundle indicator? | **No.** Current source contains the missing import/call mismatch. |
| Can this assessment identify the exact deployed Git SHA? | **No.** The PDF metadata and available logs do not contain it. |
| Are current deployment logs sufficient to reconstruct the September 8 report job? | **No.** The available log window has no matching document reference/report-job record. |
| Correct classification | **Current source defect; deployment SHA unverified.** Fix and regression-test separately. |

## 3. Cost-evidence state visible in the supplied reports

| Report | Submitted quote visibility | Detailed line-item comparison | L1 / L2 state in artefact | What can be concluded safely |
|---|---|---|---|---|
| CL | States “no submitted quotation evidence is available.” | None. | No final L2/savings/KINGA Optimised amount. | CL did not receive qualified active quote evidence for this render, or the rendered report version/data path differed. The source’s conditional matrix does not prove it populated this artefact. |
| CI | Shows two submitted header amounts: The Dent Doctor `$5,640.00` and Stylin Auto `$8,349.00`. | None. Its renderer provides only a reduced submitted-price treatment. | “Cost recommendation withheld. L2 incomplete.” | Header totals were visible but incomplete scope blocked a final L2. A useful multi-quote component evidence view is absent. |
| FR | Shows the same two header totals. | None. It provides a total-level quote comparison/ledger, not an item-level matrix. | `L1: Not available`; `L2 comparison pending evidence`; L3 unavailable. | The report explicitly says one or more required components lack a traceable price and source rows are ambiguous. Final L2 must remain withheld. |

### Why a final L2 is not populated

The forensic report says that 62 of 63 explicit source rows are verified (98% coverage), while some repair-row values are not legible/traceable. It identifies incomplete quote scope and explicitly prohibits converting a partial comparison into a payable repair total, savings figure, or settlement recommendation.

The current canonical resolver implements the same guard in `server/reporting/costIntegrity.ts`:

* `l2OptimisedCostUsd` is returned only where `composite.isComplete === true`.
* `l2IsComplete` requires both `l2Status === "complete"` and a finite positive L2 amount.
* L1 falls back only to the lowest active ledger amount, not to historical/ineligible values.
* A partial evidence amount is separately represented only when `l2Status === "evidence_qualified"`.

This means the absence of a final L2 for incomplete source scope is a **safety control**, not a blank field to be filled by estimation. The usability defect is that the reports do not present the remaining usable evidence coherently enough for insurer review.

## 4. Governed canonical quote-ledger trace

The requested claim-level ledger trace has deliberately not been performed.

| Requested evidence | Status | Reason |
|---|---|---|
| Active vs. legacy/superseded quote rows | **Not independently verified** | Requires a tenant-governed claim resolution context. |
| Per-quote line-item extraction completeness | **Not independently verified** | The PDFs show outcomes/exceptions but not the canonical row set. |
| Per-quote evidence-eligibility state | **Not independently verified** | `costIntegrity` is report-safe derived state and cannot be reconstructed from PDF text alone. |
| Per-quote total-to-line-item reconciliation | **Not independently verified** | PDF conclusions identify an exception but do not supply all source rows/totals. |
| Report-queue generation record / job metadata | **Not independently verified** | The report document reference is absent from the available production-log window. |

### Governed-access confirmation

No claim data was read through a raw database query. No administrator/global tenant override was used. No query was sent without the claim’s tenant and object-authority context. The trace therefore complies with the no-unscoped-access boundary, at the cost of the evidence limits above.

## 5. CL versus CI/FR quotation visibility

The artefacts disagree in what they expose: CL says no submitted evidence exists, while CI and FR show two submitted document totals. The following explanations remain possible; the available evidence cannot choose one conclusively.

1. **Renderer/data path difference.** CL’s conditional quote matrix may rely on a different report-record field than CI/FR’s header ledger.
2. **Evidence eligibility difference.** CI/FR may display submitted header totals as document history while CL requires active, qualified comparison evidence.
3. **Report-instance/version difference.** The PDFs were printed 38–125 seconds apart, but no embedded job IDs/build SHAs exist to prove all three consumed the same resolved-record snapshot.

The next implementation task must start with a governed, tenant-scoped read-only trace for the exact report jobs and claim record. It must map `resolveReportRecord()` / `resolveForensicReportModel()` output to each generated report before changing calculations or rendering.

## 6. Direct explanation for the FR L1 warning

The forensic report can display submitted header totals while L1 remains `Not available` because the two values have different evidentiary roles:

* The quote ledger can retain a submitted document total as traceable document evidence.
* The L1 decision value must come from an active, eligible canonical ledger row. It cannot be inferred from a historical, incomplete, unreconciled, or ineligible document header.

The exact blocking eligibility flag for this claim is **not independently verified** without governed access. The source configuration is directionally correct: it prevents a document total from being promoted silently into a decision anchor. The missing product behaviour is a clearly labelled **“submitted document total — unreconciled/not L1 decision evidence”** comparison where permitted by policy.

## 7. Required next evidence and remediation sequence

1. **Read-only governed trace:** use an authenticated tenant-scoped claim path or a purpose-built, audited diagnostic to obtain report-job IDs, canonical ledger rows, item counts, eligibility, reconciliation status, and resolved-record snapshot/version.
2. **Vehicle Passport bug fix:** import `inArray` at the confirmed router boundary; add a focused regression proving the Passport does not degrade for the invited/viewed/responded insurer filter.
3. **Shared all-tier evidence matrix:** use one canonical component/HTML helper fed from governed cost-integrity/quote-ledger data. Preserve source status and show missing values as evidence gaps.
4. **Shared L1/L2 state display:** distinguish document headers, active evidence-qualified L1, partial comparison, complete final L2, and incomplete/reconciliation-required state. Never publish an L2/saving/settlement amount unless the existing guard permits it.
5. **CI print/PDF repair:** correct the blank opening sheet, static page numbers, and iframe/visible-viewport print path; test browser print and server-PDF rendering separately.
6. **Cross-tier artefact sign-off:** use the same resolved claim record in CL/CI/FR regression renders and require visual PDF review for multiple quotes, partial scope, complete scope, legacy history, and no-quote cases.

## Open decision

Before the shared cost display is implemented, the product owner should decide whether an incomplete/unreconciled document header may be shown as:

> **Lowest submitted document total — unreconciled; not L1 decision evidence.**

That presentation would help insurer comparison without misrepresenting the number as approved L1, L2, settlement, or payment authority. It should be omitted if policy prohibits exposing unqualified totals.
