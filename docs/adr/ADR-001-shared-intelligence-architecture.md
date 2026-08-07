# ADR-001: Shared Intelligence Architecture

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2025-Q4

## Context

KINGA serves multiple stakeholder groups: claimants, assessors, panel beaters, fleet managers, engineers, and insurers. Each group needs access to vehicle intelligence, fraud analysis, physics analysis, and cost intelligence. The question was whether each portal should have its own intelligence stack or whether intelligence should be shared.

## Decision

All intelligence engines are platform assets, not portal assets. Every portal consumes the same shared engines: physics, fraud, valuation, photo forensics, cost optimisation, CGI, and interpretation. No portal owns its own engine.

## Consequences

**Positive:** A single improvement to the physics engine benefits all portals simultaneously. Benchmark data accumulated from one insurer's claims improves cost intelligence for all insurers. Fraud patterns detected in one claim inform fraud scoring across the platform.

**Negative:** Changes to shared engines require careful regression testing across all portals. A bug in a shared engine affects all portals simultaneously.

## Alternatives Considered

Portal-specific intelligence stacks were considered but rejected because they would require duplicating complex AI logic across multiple codebases, making improvements expensive and inconsistent.

## Related Components

`accidentPhysics.ts`, `fraud-scoring.ts`, `services/vehicleValuation.ts`, `pipeline-v2/quoteOptimisationEngine.ts`, `pipeline-v2/stage-9-5-cgi.ts`, `pipeline-v2/stage-10i-interpretation.ts`
