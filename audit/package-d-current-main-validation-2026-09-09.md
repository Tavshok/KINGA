# Package D Current-Main Validation Record

## A4 visual evidence — first two quote states

The current merged Claims Intelligence report was rendered through the server PDF renderer at A4 for synthetic, non-persisted canonical quote-ledger states.

| State | Result |
|---|---|
| One active quote | Page 1 contains the report masthead, case metrics, one submitted quotation, an explicit scope-gap/review-required state, and a withheld-cost recommendation. It is not blank and does not present a false L2/savings value. |
| Three active quotes | Page 1 contains the same report structure with three distinct submitted quotations and a sufficient-quote metric. It is not blank and still correctly withholds L2/savings because the fixture deliberately lacks a complete reconciled repair scope. |

Both first pages visibly use the stable `Report overview` footer label, not a fabricated physical `Page N of 2` counter. These review images are temporary validation artefacts and are not retained in the repository.

## A4 visual evidence — remaining quote states

| State | Result |
|---|---|
| Four active quotes | Page 1 is populated and displays four distinct submitted quotations. The report continues to mark L2 as incomplete and withholds a cost recommendation, savings, and settlement figure because no complete reconciled repair scope was supplied. |
| Legacy-only quote | Page 1 is populated and visibly labels the quotation as historical evidence retained separately, not active payable comparison evidence. It does not display an active-comparison outcome, L2, savings, or settlement figure. |

All four generated documents were A4 and seven pages long. The first page was non-blank in every state. The prior server-render inspection also verified populated opening and final pages in a seven-page document. The validation uses non-persisted synthetic canonical evidence; it does not substitute for an authorised re-render of the specific production legacy document `DOC-20260810-84080652`.

## Actual specified legacy document

The authorised read-only lookup resolved `DOC-20260810-84080652` to claim ID `12909902` in its owning tenant, and the current server generator rendered it without changing any source row. The resulting document was **12 A4 pages** and 8,427,557 bytes. Its opening page is populated with the real document identifier, two quotations marked `History only`, a visible historical-evidence explanation, and an explicit withheld cost recommendation. Its final page is populated with the decision-and-next-steps section, required actions, and approval chain. No opening or trailing blank page was observed. No `Page 1 of 2` or `Page 2 of 2` text was present.

This proves the exact legacy-only case requested in the completion gate. The report uses stable section labels in its footer rather than a physical total-page count; therefore no false or stale page total is displayed.
