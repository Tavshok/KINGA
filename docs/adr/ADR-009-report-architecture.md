# ADR-009: Report Architecture (CL/CI/FR Three-Tier System)

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q2

## Context

Different stakeholders need different levels of detail from a claim assessment. A claimant needs a plain-language summary. An insurer needs analytics and fraud intelligence. A legal dispute requires a forensic-grade audit trail. A single report format cannot serve all three needs.

## Decision

Three report tiers are generated for every claim:

- **CL (Claims Assessment / Process Tier):** Plain-language summary for claimants and assessors. Covers damage, repair timeline, and cost summary.
- **CI (Claims Intelligence / Protect Tier):** Analytics and intelligence for insurer staff. Covers CGI, vehicle history, fraud intelligence, and portfolio context.
- **FR (Forensic Decision / Prove Tier):** Legal-grade audit for senior management and dispute resolution. Covers physics analysis, fraud component breakdown, approval chain, and dispute flags.

Access is tiered: CL is accessible to claimants; CI is insurer-only; FR is insurer senior management only.

## Consequences

**Positive:** Each stakeholder receives information appropriate to their role and decision-making authority. The FR report can be used in legal proceedings without exposing sensitive analytics to claimants.

**Negative:** Three reports must be maintained in sync. A bug in the cost display (e.g., the `l2CompositeOptimisedCostUsd` field name issue in Aug 2026) must be fixed in all three report generators.

## Critical Implementation Note

The CI report must read `cross_validation_json.threeWaySpeedComparison` from the same source as the FR report. It must never recompute this value independently, as that would produce inconsistent speed figures across the two reports.

## Related Components

`server/reporting/reportDefinitions.ts` (CL), `server/reporting/claimsIntelligenceReport.ts` (CI), `server/reporting/forensicDecisionReport.ts` (FR)
