# Protected Owner-Processed Claims: Identification Proposal

**Date:** 17 September 2026  
**Author:** Manus AI  
**Status:** **Read-only attribution assessment and identification proposal. No data export, deletion, update, reset, backup, configuration change, or live endpoint action has occurred.**

## Conclusion

The live database does **not** contain a defensible automatic attribution path for the owner’s approximately 70 personally processed claims. The complete direct-owner dry run returned **zero claims**, rather than a result close to 70.

This is a material negative result, not evidence that the owner’s claims do not exist. It means the available provenance fields do not record the owner’s interaction with them. A date range, a batch boundary, `claim_source`, or a “real-looking” claimant identity would be an unsafe substitute because the test and owner activity overlap in time and several creation paths do not persist an actor.

> **Decision required before any full-reset proposal:** provide an owner-controlled, exact protected-claim list or another direct, reproducible fingerprint for those claims. No broader deletion predicate will be proposed until the list produces a reviewed dry-run count near the owner’s expected total.

## Read-only attribution result

The configured owner account was directly matched through the environment-held open ID using a salted one-way comparison. Neither the open ID nor any other direct identifier was selected, stored, or displayed.

The assessment looked for a relationship from that directly matched user to claims through every available live table that can record an actor. Each result was zero.

| Direct-owner signal | Distinct claims found | Result |
|---|---:|---|
| `claims.claimant_id` equals owner user | 0 | No owner-as-claimant records. |
| `audit_trail.user_id` on a claim | 0 | No owner audit-trail claim record. |
| `audit_logs.user_id` for claim resources | 0 | No owner audit-log claim record. |
| `claim_events.user_id` | 0 | No owner-emitted claim event. |
| `claim_assignments.assigned_by_user_id` | 0 | No owner-created assignment. |
| `claim_assignments.assigned_to_user_id` | 0 | No owner assignment. |
| `claim_approvals.actor_user_id` | 0 | No owner approval record. |
| `claim_comments.author_user_id` | 0 | No owner-authored claim comment. |
| `claim_documents.uploaded_by` | 0 | No owner-uploaded claim document. |

The union of all nine signals is also **zero**. Therefore, it is not valid to use any of them as the owner-processed-claim selector.

## Why the available alternatives are not valid selectors

The `claims` table has no `created_by` or equivalent creator field. It has `claim_source` and `source_document_id`, but neither identifies the user who acted. The origin categories are also not an owner-specific fingerprint: 17,962 of 18,066 claims have no recorded source; 97 use `document_ingestion`; four use `pdf_upload`; and three use other named channels. The 97 document-ingestion records are numerically near 70, but they are not linked to the owner and must not be treated as the owner’s protected set.

The generic `claim_submitted` event exists for only 44 claims and is attributed to 44 different actors. The configured owner is among none of them. It is therefore neither complete enough nor owner-specific enough to use.

The source inspection explains this gap. Core claim persistence stores claimant and workflow data, but several creation paths insert a claim without a consistent creator/audit row. Seed and direct-write paths can do the same. The absence is a historical data-provenance limitation; it must not be papered over by inference during a destructive reset.

## Safe identification method

The owner should provide an exact, known list of the claims to preserve. The preferred identifier is **claim number**, because it is the human-recognisable immutable business identifier in the claim record. An exact list of internal claim IDs is also acceptable if the owner already has it. The list must be supplied through a secure owner-approved channel, not committed to GitHub, included in a Markdown report, pasted into a public chat transcript, or stored in the project workspace.

The future read-only matching operation will use the supplied values only in memory. It will return aggregate evidence, not claim records: supplied-item count, matched-claim count, unmatched-item count, duplicate-item count, and counts of protected dependent records. The operation will stop if the matched count is materially different from the supplied count or is not near the owner’s stated expected total of approximately 70.

| Preflight control | Required result |
|---|---|
| Exact identifiers supplied by owner | Every item parses as the approved identifier type. |
| Direct match to `claims` | One distinct claim for each supplied identifier. |
| Expected size | Result is near the owner’s stated approximately 70 claims; any material difference stops the reset design. |
| Duplicate protection | No claim is selected twice and no supplied identifier maps ambiguously. |
| Owner account | Directly re-verified and independently protected. |
| Claimant-user protection | Every claimant linked to a protected claim is included in the future protected-user set, regardless of whether it carries a synthetic marker. |
| Dependency inventory | Aggregate counts are obtained for all records linked to the protected claims before any reset proposal. |

## What the next read-only dry run will establish

Once the owner supplies the exact list, the next dry run will determine the exact protected-claim count and the aggregate dependency closure. It will count the linked claimant users, identify how many of those claimants carry the synthetic marker, and count linked reports, assignments, approvals, comments, documents, assessments, quotations, events, and other foreign-key descendants. It will not expose direct records or personal data.

That result will decide whether the reset can be designed as a clean exclusion set. It will not itself authorise an archive, export, deletion, user reassignment, claim reassignment, claim nullification, or database write.

## Explicit non-authorisation

No full-reset execution plan is proposed by this document. The prior 35,085-user partial-cleanup proposal is superseded only in the sense that no deletion should be considered until the protected claims are identified. The owner account remains protected. All users and claims, including the test data, remain unchanged.

## References

[1]: file:///home/ubuntu/kinga-replit/audit/live-users-cleanup-proposal-2026-09-17.md "Live users cleanup proposal and chronology addendum"
[2]: file:///home/ubuntu/kinga-replit/drizzle/schema.ts "KINGA source schema and claim provenance declarations"
[3]: file:///home/ubuntu/kinga-replit/server/db.ts "KINGA core claim persistence helper"
[4]: file:///home/ubuntu/kinga-replit/server/routers/claims-core.ts "KINGA claims router and audit-event paths"
