# ADR-005: AI Advisory Policy

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q1

## Context

KINGA uses LLMs for document extraction, damage analysis, fraud narrative generation, and interpretation. The question was whether AI outputs should be treated as decisions or as advisory inputs to human decisions.

## Decision

AI is advisory. AI outputs inform human decisions — they do not make them. Every AI-generated assessment requires human review before a settlement is approved. The platform never auto-approves or auto-rejects a claim based solely on AI output.

## Consequences

**Positive:** Human oversight is preserved. AI errors can be caught and corrected before they affect claimants. The platform complies with insurance regulatory requirements for human decision-making authority.

**Negative:** Processing time is longer than a fully automated system. Human reviewers are required for every claim.

## Alternatives Considered

Fully automated approval for low-value, high-confidence claims was considered but deferred pending regulatory guidance and sufficient benchmark data to validate confidence thresholds.

## Related Components

`server/pipeline-v2/stage-10i-interpretation.ts`, `server/decision-governance.ts`, `server/workflow-engine.ts`
