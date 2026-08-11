# Quote Line-Item Persistence Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Audit date:** 11 August 2026

## Persistence Path

Extracted quote line items are written through `persistExtractedQuote()` in `server/persistExtractedQuote.ts`. The helper resolves an idempotent `panel_beater_quotes` record, replaces stale line items on an extraction re-run, and inserts the latest mapped entries into `quote_line_items`. Its amounts are written as decimal currency units, while the parent quote amount remains stored in integer cents.

## Live Data Verification

The production database was inspected on three assessed claims with known quotes:

| Claim ID | Quote records | Persisted line items |
|---|---:|---:|
| 10,719,902 | 3 | 59 |
| 11,709,902 | 4 | 23 |
| 12,879,902 | 2 | 19 |

All sampled quotes had persisted `quote_line_items` rows. The former silent line-item persistence defect is therefore resolved. Future regressions are guarded by the idempotent helper, direct database evidence, and existing quote extraction/report tests.
