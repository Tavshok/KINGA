# Package A — Governed Canonical Quote-Ledger Trace

**Claim reference:** `DOC-20260810-84080652`  
**Purpose:** Read-only reconstruction of the quotation, evidence-eligibility, L1/L2, and report-provenance state.  
**Prepared:** 8 September 2026  
**Scope:** The claim was reached only through the project owner’s tenant-scoped claim lookup, confirmed by `requireGovernedTenantClaim`, then loaded through `resolveReportRecord` with the `cost_comparison` audience. No report was regenerated; no claim, quote, evidence, policy, workflow, or database record was changed.

> **Conclusion.** The record contains quotation and document-backed evidence, but it does **not** contain an active canonical quote ledger. The two report-record quote rows are therefore classified as **legacy, comparison-only history**, not active L1/L2 evidence. A final L1 or L2 would not be truthful at present. The supplied historical report discrepancy is explained by report-specific handling of the same legacy state at the time the PDFs were generated, followed by a later report-projection correction; it is not supported by a valid final L2.

## 1. Authority, method, and limitation

The trace used the following read-only sequence: (1) `getClaimByNumber(claimReference, ownerTenantId)`, (2) `requireGovernedTenantClaim(claimId, ownerTenantId)`, and (3) `resolveReportRecord({ claimId, tenantId, audience: "cost_comparison" })`. The target resolved to internal claim ID `12909902` in the authorised owner tenant. The canonical resolver, rather than a global claim lookup or browser session, is the evidence source for the results below.[1]

The report-job lookup was also bound to the same tenant **and** claim ID. It retrieved job and provenance metadata only. The job snapshot records request inputs, not an immutable serialized `ResolvedReportRecord`, source-document bytes, or source-commit SHA. Consequently, the metadata can establish chronology and job-level inputs, but cannot prove byte-for-byte identity between a supplied PDF and a current live record.[4]

| Control | Result |
|---|---|
| Claim authority | Confirmed through the common tenant–claim authority helper before record resolution |
| Data access | Server-side, tenant- and claim-bound; no browser access and no unscoped claim query |
| Mutations | None — no report regeneration, claim retry, update, schema change, or export write |
| Immutable report snapshots | No `report_snapshots` or `report_links` rows exist for this tenant/claim combination |
| Interpretation limit | Historical job metadata identifies the generator label and inputs, but not the exact resolved-data snapshot or deployed commit used for a PDF |

## 2. Current report-record quotation inventory

The current canonical report record returns two physical quotation entries, both marked `submitted` and `original`. It also returns line items: 29 for The Dent Doctor and 27 for Dynamic Africa Trading t/a Stylin Auto. Neither record carries the canonical quote-ledger status, evidence-eligibility reason, scope fingerprint, tax basis, or reconciliation metadata required to treat it as active comparison evidence.[1] [2]

| Report-record quote ID | Repairer | Stored status / type | Stored currency | Stored header amount (raw cents) | Line-item count | Eligibility in `ReportCostIntegrity` |
|---:|---|---|---|---:|---:|---|
| 10620001 | The Dent Doctor | `submitted` / `original` | ZWL | 564,000 | 29 | `legacy_unverified`; `comparison_only` |
| 10830001 | Dynamic Africa Trading t/a Stylin Auto | `submitted` / `original` | USD | 834,900 | 27 | `legacy_unverified`; `comparison_only` |

The current `ReportCostIntegrity` result is unambiguous: `sourceQuoteCount = 2`, `activeQuotes = []`, `submittedQuotes = 2 legacy rows`, `quoteScopeStatus = incomplete_scope`, and `l2Status = incomplete_scope`. L1, final L2, evidence-qualified L2, benchmark cost, coverage percentage, canonical component selections, and quote reconciliations are all `null` or empty. The `missingRequiredComponents` list is also empty, but that is a consequence of the **absent canonical ledger**, not evidence that the repair scope is complete.[2]

> **Do not compare the two stored header amounts as a lowest quote.** They are in different stored currencies, neither has an active evidence eligibility, and the normalised report adapter explicitly returns no active quote and no L1. A lower raw amount would not be a valid L1 selection.

## 3. Document-backed evidence and exact blockers

The governed evidence register contains three document-level quotation groups: The Dent Doctor quote 3359, C.A.M.E.L quote E1693, and Stylin Auto quote 1245. These identifiers do **not** map one-for-one to the two current report-record quote IDs. That mismatch itself must be resolved before a canonical status can be assigned; it must not be “fixed” by silently merging rows or copying totals.

| Evidence group | Verified/reconstructed source facts | Exact issue | Consequence |
|---|---|---|---|
| The Dent Doctor, quote 3359 | Source total on page 12: **USD 6,500.00** | Structured header is **USD 5,915.00**; no documented revision links the figures | **Blocking:** structured amount cannot be used as equivalent comparison evidence |
| C.A.M.E.L, quote E1693 | Source page 14: spares total **USD 5,425.00**; grand total **USD 7,230.00** | Separate spares/repairs columns were not retained in the structured ledger; 21 visible spares rows total **USD 5,445.00** | **Blocking/review:** no trustworthy row-level equivalence or forced subtotal |
| C.A.M.E.L repairs | Six fully legible repair rows total **USD 1,910.00** | Grand total less stated spares total is **USD 1,805.00**; the **Front Bumper** amount is not fully legible | **Review:** Front Bumper amount requires human confirmation; no value may be inferred |
| Stylin Auto, quote 1245 | Source page 13: **USD 7,265.00** carried forward + **USD 1,084.00** VAT = **USD 8,349.00** total general | Current structured line-item total is **USD 8,195.00**, which reconciles to neither source pre-VAT nor source total | **Blocking:** source arithmetic is not retained in the structured ledger |
| Stylin Auto handwritten rows | Source document contains handwritten parts, repairs, and spray-painting rows | Exact components and amounts remain below source-confidence thresholds; required fields include component, unit price, and extended amount | **Blocking final total, savings, settlement, and verified arithmetic** pending human verification |

The controlled evidence ledger retains visible source rows without allocating differences. It deliberately records the uncertain Stylin Auto entries as `human_verification_requested`, and identifies the C.A.M.E.L Front Bumper amount as an unresolved evidence gap. This is the appropriate conservative outcome: it preserves traceability rather than creating a plausible-looking repair total.[3]

### Why there is no honest L1

L1 requires at least one canonical ledger row classified `active` or `supplementary`, with a valid active comparison amount. This claim has zero such rows. The two report-record entries are visible historical submissions only; their direct header amounts cannot be selected as L1 because the ledger metadata and source-to-structured reconciliation are incomplete.[2]

### Why there is no honest final L2

A final L2 requires an equivalent, reconciled evidence basis, including source scope, revision status, tax treatment, and component-level prices. The actual blockers are: absence of `canonicalQuoteLedger`; the Dent Doctor source-to-structured total mismatch; C.A.M.E.L’s missing retained column split, spares discrepancy, and unreadable Front Bumper amount; Stylin Auto’s source/line-total mismatch; and unverified handwritten parts and repair rows. The system may continue to display source evidence as history, but it must not display a composite payable total, saving, settlement recommendation, or “KINGA Optimised” figure as final.[2] [3]

## 4. Explanation of the supplied CL/CI/FR discrepancy

### Answer to the requested diagnosis

The historical discrepancy was principally a **different report-specific evidence-eligibility/presentation branch**, not a valid difference in L1/L2 evidence. At the time of the first recorded three-report run, the Claim Assessment renderer built `activeQuoteRows` from `costIntegrity.activeQuotes`; when legacy history was present but no active canonical rows existed, it explicitly made the line-item comparison set empty. Claims Intelligence and Forensic, by contrast, used `costIntegrity.submittedQuotes`, which retains legacy history for visible header/card amounts. All three therefore operated on legacy evidence, but did not present that state consistently.[2]

The historic Claim Assessment path also queried quote rows directly and used the active-only set for its line-item breakdown. The historic Claims Intelligence and Forensic paths separately queried quote rows and displayed `submittedQuotes`; at that point, their cards could label legacy entries as active-market quotes. The later correction introduced an explicit legacy-history presentation and unavailable active metrics, rather than turning the entries into L1/L2 evidence.[5]

This means the report differences were **not** explained by one report correctly having a final L2. Neither current data nor the historic code supports that conclusion.

### Job/provenance chronology

The first completed CL/CI/FR job cluster occurred between **12:44:37 UTC and 12:44:46 UTC on 14 August 2026**, under label `R0-20260812`, with the same claim, tenant and validation-run parameter. A second cluster started at 12:53:55 UTC. The first CI retry in that cluster failed only during S3 upload with a 503 `SlowDown`; a later retry at 12:55:33 UTC completed successfully. This storage failure is not a quotation-eligibility or L1/L2 finding.

| UTC start | Job | Report key | Result | Pages | Generator label | Input-hash prefix |
|---|---|---|---|---:|---|---|
| 12:44:37 | `9862d1cc…` | `claim.assessment` | completed | 60 | `R0-20260812` | `ae151cb4…` |
| 12:44:43 | `8a361f0e…` | `claim.intelligence` | completed | 65 | `R0-20260812` | `0544d2aa…` |
| 12:44:46 | `021bbb6b…` | `claim.forensic` | completed | 65 | `R0-20260812` | `5241508a…` |
| 12:53:55 | `ff39e43d…` | `claim.assessment` | completed | 137 | `R0-20260812` | `6ed3be5d…` |
| 12:54:00 | `4d6060ee…` | `claim.intelligence` | failed S3 upload | — | `R0-20260812` | `f90b6917…` |
| 12:54:12 | `59dd1eff…` | `claim.forensic` | completed | 166 | `R0-20260812` | `67a33bc7…` |
| 12:55:33 | `f269c560…` | `claim.intelligence` | completed | 166 | `R0-20260812` | `b461ab8b…` |

The later quote-projection correction was committed at **13:49:47 UTC**, after every job above. Its recorded live no-write check for this same claim confirmed that two submitted amounts should remain visible as **legacy history**, with active-market metrics suppressed and no false zero amount. The supplied PDFs therefore pre-date that correction. The job `input_hash` values differ because `reportKey` and generation time are part of the recorded input snapshot; the system did not persist a resolved-record snapshot or source revision, so those hashes cannot establish that differing report content came from different claim data.[4] [5]

## 5. Current renderer position versus the supplied PDFs

On the present source path, the individual report tiers are tenant-scoped and resolve through the canonical report-record contract. Claims Intelligence and Claim Assessment call `resolveReportRecord` directly; Forensic calls `resolveForensicReportModel`, which itself begins with the same report-record resolution. Current quote presentation is therefore intended to distinguish **visible legacy history** from **active comparison evidence**, while keeping L1/L2 governed by the same cost-integrity contract.[1] [2] [6]

This trace did **not** regenerate a report, so it makes no claim about a newly rendered PDF. It does establish, from the live governed record and current resolver output, that a correct current presentation for this claim is:

| Presentation element | Truthful current state |
|---|---|
| Visible submission history | Two legacy records may be shown, with clear non-comparison qualification |
| Active comparison quote count | 0 |
| Lowest active quote / L1 | Not available |
| Final L2 / KINGA Optimised figure | Not available; L2 incomplete |
| Savings, adjustment, settlement amount based on L2 | Not available |
| Line-by-line equivalence table | Must not masquerade as an active multi-quote comparison until the canonical ledger, quote identity mapping, and evidence exceptions are resolved |

## 6. Future implementation handoff — no action taken

The next implementation should be a bounded **canonical quote-ledger and evidence-reconciliation batch**, not a renderer-only patch. Rewriting labels before the ledger is repaired would merely make an unsupported calculation look consistent across three reports.

| Workstream | Required outcome | Required decision or control |
|---|---|---|
| Quote identity reconciliation | Link each physical `panel_beater_quotes` row to its actual source document and evidence-ledger quote identity, preserving all unmatched rows | Confirm which source document/revision is authoritative for each repairer; never overwrite or merge by name alone |
| Source arithmetic preservation | Retain source totals, subtotals, VAT and explicit line rows separately from structured entries | Human review of Dent Doctor, C.A.M.E.L and Stylin Auto discrepancies; no inferred residual allocation |
| Legibility remediation | Resolve the C.A.M.E.L Front Bumper amount and Stylin handwritten components/amounts from the original evidence | Explicit human verification and provenance capture; no OCR-only amount promotion |
| Eligibility classification | Populate a canonical ledger status, eligibility reason, revision status, tax basis and scope fingerprint per confirmed quote | Product/claims decision on active, supplementary, historical, superseded and excluded conditions |
| Currency policy | Define whether and how ZWL and USD may enter a common L1/L2 basis | Finance/governance approval of authoritative currency, conversion date/source, and audit disclosure; absent that, do not rank cross-currency amounts |
| L1/L2 gate | Permit L1 only from active comparable evidence; permit final L2 only from complete, reconciled scope | Regression cases must prove no L1/L2 or savings under any current blocker |
| Report parity | CL, CI and FR must consume the same `ReportQuoteEvidencePresentation` and label legacy history identically | Regression with this exact legacy-only state: 2 visible history rows, 0 active rows, L1/L2 unavailable, no active-comparison wording |
| Provenance | Persist report job generator code revision and a cryptographic fingerprint of the resolved report record/ledger selection | Schema and governance design decision; preserve existing jobs and do not retroactively claim byte-level provenance |

## 7. Findings ledger

| ID | Classification | Finding | Required next action |
|---|---|---|---|
| PA-001 | Confirmed | Current resolved record has two visible historical quote rows, but no canonical ledger or eligible active comparison row | Keep L1/L2, savings and settlement cost outputs unavailable |
| PA-002 | Confirmed | Evidence-register quote identities and current report-record IDs are not one-to-one; three source groups require controlled reconciliation | Establish a provenance-preserving identity map before status promotion |
| PA-003 | Confirmed | Dent Doctor, C.A.M.E.L and Stylin Auto contain recorded source-to-structured defects; Stylin and C.A.M.E.L also contain specific unresolved legibility/arithmetic issues | Human verification and source-ledger reconciliation; do not infer values |
| PA-004 | Confirmed historical presentation defect | CL excluded legacy history from its active-only line-item comparison, while CI/FR displayed legacy `submittedQuotes` amounts; later code corrected the presentation language after the recorded jobs | Add permanent tier-parity regression against a legacy-only fixture after the ledger work is approved |
| PA-005 | Provenance limitation | Job metadata captures request inputs and a generator label, not source commit or resolved-record snapshot | Design immutable render-input provenance for future reports; do not overstate historic traceability |

## References

[1]: file:///home/ubuntu/kinga-replit/server/reporting/resolvedReportRecord.ts "Resolved report record and tenant-scoped claim resolution"

[2]: file:///home/ubuntu/kinga-replit/server/reporting/costIntegrity.ts "Canonical report cost-integrity and quote-evidence presentation contract"

[3]: file:///home/ubuntu/kinga-replit/server/reporting/evidenceGovernancePresentation.ts "Evidence ledger, reconciliation and evidence-gap presentation contract"

[4]: file:///home/ubuntu/kinga-replit/server/reporting/reportQueue.ts "Tenant-scoped report job and provenance snapshot implementation"

[5]: https://github.com/Tavshok/KINGA/commit/16fd427bd1a58dfcf89a0f6f42b22ce053f82c00 "14 August 2026 quotation-evidence projection correction"

[6]: file:///home/ubuntu/kinga-replit/server/reporting/forensicReportModel.ts "Forensic model’s canonical resolved-report-record dependency"
