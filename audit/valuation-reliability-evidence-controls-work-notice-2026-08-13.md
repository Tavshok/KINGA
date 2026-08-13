# Controlled Work Notice: Valuation Reliability and Evidence Controls

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no implementation authorised by this notice

## 1. Purpose

KINGA currently exposes a client-facing **KINGA Market Valuation** and correctly labels it as decision support. The present valuation engine is evidence-light: it can generate a value, but it does not yet persist a sufficiently auditable set of market comparables, recency, coverage, adjustments, and source limitations to present the result as independently verified or highly accurate.

This work notice proposes the reliability controls required to make the valuation evidence contract explicit before any stronger claim about market support is made.

## 2. Required Evidence Contract

Every valuation used beyond a provisional indication must retain a source-backed evidence ledger with:

| Evidence dimension | Required control |
|---|---|
| Comparable source | Identifier, source type, retrieval time, and permitted reuse status |
| Vehicle match | Make, model, year, trim/specification, mileage, condition, modifications, and location match/mismatch |
| Recency | Comparable listing/transaction date and stale-source flag |
| Coverage | Comparable count, spread, missing facts, and excluded comparables with reason |
| Adjustments | Itemised, attributable adjustments with evidence—not an opaque model total |
| Valuation result | Market valuation, currency, value date, provenance, and a bounded evidence state |
| Review | Human review request and outcome when evidence is incomplete or conflicting |

## 3. Presentation Boundaries

Clients continue to see **KINGA Market Valuation** with plain-language evidence status and their obligation to confirm vehicle facts and chosen insured value. Clients must not see unexplained confidence percentages, fabricated comparable detail, or an assertion of independent verification when the underlying ledger does not support it.

Agencies and insurers may see a professional evidence view covering sources, matching, recency, adjustments, exclusions, limitations, client-proposed value, variance, acknowledgement, and deviation record. This remains decision support only and must not issue a policy, determine a premium, establish a sum insured, calculate a repair cost, or determine settlement.

## 4. Proposed Implementation Scope

The implementation would introduce a provenance-capable comparable ledger, explicit evidence-state resolver, valuation-review request and audit trail, agency/insurer professional evidence projection, and deterministic tests for missing, stale, conflicting, and sufficiently evidenced comparable sets. It would preserve the already implemented dated Vehicle Passport condition snapshot and service-request deviation controls.

## 5. Explicit Exclusions

This package does **not** authorise a claim, policy, premium, repair, settlement, payment, underwriting, or external comparable-data provider connection. A provider connection, licensing agreement, API key, or live market-data ingestion would require separately controlled approval.

## 6. Acceptance Criteria

The package is complete only when the system never presents an evidence-light output as independently verified, every material valuation conclusion has the required provenance or a visible evidence limitation, raw client confidence scores remain suppressed, professional views contain verifiable evidence fields, and focused regressions plus production builds pass.
