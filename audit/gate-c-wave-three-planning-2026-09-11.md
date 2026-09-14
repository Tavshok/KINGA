# Gate C Wave 3 Planning — Assessment, Evidence and Reporting

## Planning-only boundary

This document plans the existing Wave 3 group from the reviewed Gate C dependency plan. It does **not** generate Wave 3 source subsets, SQL, snapshots, indexes, foreign keys, scratch databases, or DDL. It does not connect to `kinga_staging`, production, a migration account, or application data.

Wave 3 may be generated only after the global sole-key primary-key reconciliation receives review approval and a fresh explicit authorisation confirms that Wave 3 generation and two-run loopback proof may begin.

## Proposed scope

The existing dependency plan assigns **50** selected tables to Wave 3, titled **Assessment, evidence and reporting**. Their only dependencies outside the Wave 3 group are already-planned/constructed Wave 1–2 tables: `claims`, `users`, and `claim_assignments`.

| Source-key status within Wave 3 | Count | Planning implication |
|---|---:|---|
| Explicit key already present or outside the 145-gap population | 12 | Can be assessed against the normal Wave 3 source contract. |
| Primary key added by the approved global safe pass | 9 | New explicit source key is available once that review branch is accepted. |
| Held from global key reconciliation | 29 | Inclusion requires a table-specific key-contract decision or a consciously limited Wave 3 scope; no inference is permitted. |
| Total planned Wave 3 tables | 50 | No SQL has been generated. |

The nine globally reconciled tables that are in Wave 3 are `country_repair_index`, `currency_exchange_rates`, `extracted_document_data`, `fraud_rules`, `police_reports`, `pre_accident_damage`, `quote_line_items`, `supplier_quote_line_items`, and `supplier_quotes`.

## Candidate and dependency review

Two previously verified active candidates naturally belong to this group: `adjuster_sign_offs` (depends on `claims`) and `currency_exchange_rates` (no planned source dependency). The eight held Gate C candidate tables remain absent from Wave 3 and are not reconsidered here.

The plan retains the original internal dependency order: create independent records first; then `assessor_reports`; then `assessor_report_attachments` and `assessor_report_reviews`; then `automation_policies` and `claim_confidence_scores`; then `claim_routing_decisions`. Any Wave 3 source-generated foreign key may only reference a table created earlier in this order or one of `claims`, `users`, and `claim_assignments` supplied by Waves 1–2.

| Wave 3 sub-group | Intended contents | Current gate |
|---|---|---|
| Evidence and assessment roots | `ai_assessments`, assessor reports, extracted document records, police/pre-accident evidence, quotes and cost components |  Several root records are in the 29 held key-contract cases; resolve or partition before SQL generation. |
| Fraud, confidence and routing | fraud rules/alerts/indicators, confidence scores, automation policies, routing decisions, optimisation results | Routing depends on the promoted `automation_policies` and `claim_confidence_scores`; both are still key-contract holds. |
| Reports and report audit | generated/PDF reports, report links/snapshots/access audit, provenance and quotation support | Do not include alternate-key report/provenance tables until their key contracts are reviewed. |
| Marketplace, repair and supplier evidence | panel-beater/insurer/service/supplier evidence and repair intelligence | Relationship and unique-identity variants remain in the hold list and cannot be silently normalised. |

## Required pre-generation gate

Before any Wave 3 subset or scratch SQL is generated, perform the following source-only review steps in this order.

1. Select one of two bounded scopes: either resolve the key contract of every Wave 3 hold to include the full 50-table group, or approve a reduced Wave 3 baseline containing only tables with already-explicit or globally safe primary keys.
2. Re-run the source manifest and generated-table inventory from the accepted source revision. Verify exact Wave 3 membership, index count, foreign-key count, and all prerequisite references before any connection opens.
3. Reconfirm the six previously verified candidate paths and the eight held candidates. No held candidate may enter merely because its table name appears in an earlier plan.
4. Generate reviewed `CREATE TABLE`, required index, and source-declared foreign-key SQL only. Reject `DROP`, data DML, non-FK `ALTER`, unreviewed object types, duplicate/empty identifiers, and foreign keys to a key not declared by the source.
5. Authorise and execute two uniquely named `127.0.0.1` `kinga_gatec_*` scratch replays with the exact Wave 1/2 prerequisite SQL. Compare SQL and metadata fingerprints and verify disposal.

Until this gate is explicitly authorised, no Wave 3 implementation activity is permitted beyond planning and source-only analysis.
