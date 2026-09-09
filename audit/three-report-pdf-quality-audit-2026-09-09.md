# Three-Report PDF Quality Audit — Working Evidence Record

## Scope and Evidence Boundary

This read-only working record compares the user-supplied Claims, Claims Intelligence, and Forensic PDFs for `DOC-20260810-84080652`. It records visible and extractable output defects only. It does not alter report source, claim data, quotations, evidence state, workflow, or database records.

## Visual Inspection Findings — Opening Pages

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Assessment Report | 1 of 7 | Opening page is populated and carries a normal report header, draft banner, assessment summary, decision summary, and footer. It does not exhibit the blank-page failure. The cost decision area nevertheless states “No submitted quotations,” which conflicts with later report-family evidence and requires data-path comparison rather than a presentation-only conclusion. | Content-contract investigation required |
| Claims Intelligence Report | 1 of 14 | Page has only generic header/footer framing and a pale empty container. It contains no report content. This is a confirmed structural blank first page, not ordinary whitespace. | P0 print/pagination defect |

The next visual pass will compare the CI content page, the Forensic opening pages, and the detailed evidence/cost sections.

## Visual Inspection Findings — First Populated Pages

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Intelligence Report | 2 of 14 | The first substantive content appears only on page 2, confirming that the blank page 1 is not an intentional cover page. The page also combines the report overview with the start of Section 01, which weakens page-level hierarchy. The cost section is clear that the two quotations are history-only, in mixed ZWL/USD currencies, and that no L1/L2 or savings figure is calculated. | P0 pagination defect; content hierarchy refinement |
| Forensic Claim Decision Report | 1 of 12 | The page is populated, but a visible vertical scroll track and thumb are rendered inside the right report edge. This is a report-control/container artefact, not report evidence, and should never be printed or present in a formal forensic document. The cost panel shows the same mixed-currency/historical-evidence state as CI. | P1 print-control leakage |

The supplied PDFs establish that the Claims Report page path is structurally populated; CI has an opening blank page; and Forensic leaks a scrollable container control into the report surface. The next pass will inspect quotation/evidence pages and later-page fragmentation.

## Visual Inspection Findings — Cost Evidence and L1/L2 Communication

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Intelligence Report | 4 of 14 | The page presents an internally contradictory state. The settlement panel correctly says L2 comparison is pending and no settlement is available, but also displays `−$0.00` exclusions and excess values. A zero deduction is visually indistinguishable from a calculated financial result and is inappropriate when the parent comparison/settlement state is unavailable. The detailed source ledger begins on the same page and is correctly labelled as audit-only, but its dense multi-column layout is not an insurer-facing side-by-side quotation comparison. | P1 unavailable-state presentation defect; P2 evidence-ledger usability issue |
| Claims Intelligence Report | 8 of 14 | The mixed-currency history is explained truthfully: two legacy quotation records are visible, no active comparison evidence exists, and L1/L2/savings/settlement are withheld. However, the same withholding rationale is repeated in multiple panels, producing an overly defensive and difficult-to-scan cost section. It also labels the repair ratio as `52.0%` despite no active quotation comparison; this must be traced to confirm the independent source and avoid implying it was derived from L1/L2. | P2 content consolidation; P1 metric-provenance check |

The audit distinguishes the absence of L1/L2 from a defect: the supplied CI output explicitly states that the quotations are mixed-currency, legacy-only history and are not eligible active comparison evidence. The evidence-policy outcome appears intentional, while its clarity, redundant presentation, and adjacent zero-value financial widgets need repair.

## Visual Inspection Findings — Vehicle Passport

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Intelligence Report | 12 of 14 | Vehicle Passport begins after roughly half an A4 page of empty space, then switches abruptly from the formal light report design to a dark dashboard-style card interface. The first card is cut by the page boundary, meaning its continuation starts without complete local context on the next page. | P1 pagination and visual-system defect |
| Forensic Claim Decision Report | 11 of 12 | The same dark dashboard-style Vehicle Passport module appears. It has stronger page placement than the CI version, but still conflicts with the typography, white-space, and evidence-panel vocabulary of the formal report. The output presents zero values and a “Very Low” risk label; whether these mean verified zero history or unavailable/insufficient history must be traced before any wording or value change. | P2 visual-system defect; data-state interpretation trace required |

The shared Vehicle Passport block has not been adapted for paged report media. Its dark web-dashboard panels, fixed-looking vertical blocks, and uncertain empty-data semantics require a common presentation contract rather than separate CI and Forensic CSS edits.

## Visual Inspection Findings — Cross-Tier Quote State and Ledger Usability

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Assessment Report | 3 of 7 | The quotation section says “No quotes submitted for this claim,” yet the same page’s final recommendation says the “highest submitted quote” differs from the KINGA estimate by 13.2%. This is a direct internal contradiction. It also conflicts with CI and Forensic, both of which identify two submitted historical quotation documents. | P0 report-data/projection contradiction |
| Forensic Claim Decision Report | 2 of 12 | The detailed source-row ledger proves that individual component-level source evidence exists, but it remains an audit trace rather than an insurer-facing comparison: it has one amount/source row at a time, no aligned repairer columns, no component-match/reconciliation outcome, and no eligible-comparison summary. A vertical scrollbar is again visibly printed at the right edge, confirming control leakage is not confined to the opening page. | P1 print-control leakage; P2 comparison presentation gap |

The report family currently exposes two different concepts without a clear boundary: (1) a source-evidence ledger, which is useful for audit; and (2) a quote comparison, which insurers expect to see as matched components across submitted repairers and any eligible KINGA benchmark. The ledger must not be relabelled as a comparison, but the projection gap must be repaired when a valid side-by-side comparison contract exists.

## Visual Inspection Findings — Late Claims Intelligence Pages

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Intelligence Report | 13 of 14 | Vehicle Passport continuation is a sparse dark-panel page: the renewal-risk and fraud-signal panels use only the upper portion of the page and leave the lower third empty. This is not a fully blank page, but it is avoidable print fragmentation caused by fixed dashboard-style card heights. | P2 pagination/print-media defect |
| Claims Intelligence Report | 14 of 14 | The final approval workflow page is populated and legible. It nevertheless retains application-style chips, icons, and workflow cards rather than the report’s formal evidence-panel language. This is a design-consistency issue, not a missing-content defect. | P3 formal-report presentation refinement |

The CI PDF has a confirmed blank opening page and several inefficient/sparse late pages. The final page itself is valid, but the Vehicle Passport and workflow sections demonstrate that screen-oriented components are being printed with minimal adaptation to A4 pagination.

## Visual Inspection Findings — Remaining Claims and Forensic Sections

| PDF | Page | Verified observation | Initial classification |
| --- | ---: | --- | --- |
| Claims Assessment Report | 6 of 7 | Vehicle Passport uses the same dark dashboard module and breaks its third card at the footer, leaving no repeating section label or clean card boundary. It also presents `0` history/risk values and a “LOW RISK” label while several related fields use em dashes; the distinction between verified zero and unavailable history is unclear. | P1 print-media fragmentation; P2 empty-data semantics |
| Forensic Claim Decision Report | 5 of 12 | The report has a second visible vertical scrollbar down the right edge, confirming that scroll-container leakage spans multiple Forensic pages. The cost explanation correctly says mixed ZWL/USD records do not support an L1/L2 total or settlement, but its large centred warning and dense prose consume substantial page area before the executive sections. | P1 control leakage; P2 cost-state layout density |

## Confirmed Cross-Report Observations

1. **Claims Report is structurally printable**, whereas CI has a blank opening page and Forensic has scroll-control leakage. This indicates report-specific print composition defects, not a single universal browser failure.
2. **Vehicle Passport is the common report-media defect.** All three PDFs print the same dark dashboard component; CI and Claims fragment it across page boundaries, and all three make the zero-versus-unavailable distinction ambiguous.
3. **L1/L2 is withheld by current evidence policy in CI and Forensic**, because the supplied source records are mixed currency and legacy/non-active. That is not a reason to fabricate L2. The defect is the absence of a clear insurer-facing comparison/provenance view and the Claims Report’s contradictory quote-status projection.
4. **Forensic contains printed controls** and needs a print-surface correction independent of the iframe/browser routing already attempted.
