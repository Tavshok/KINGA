# ADR-004: Physics Engine Immutability

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q1

## Context

The physics engine (`accidentPhysics.ts`) implements impulse-momentum analysis, speed estimation, and coefficient of friction calculations. These calculations are used in legal-grade forensic reports (FR tier) and may be cited in dispute resolution. Inconsistent physics outputs across claim versions would undermine the platform's credibility.

## Decision

The physics engine is immutable. No modification to `accidentPhysics.ts` is permitted without a formal Architecture Review. The engine's numerical contracts are enforced by `physicsNumericalContract.test.ts` — any change that alters the numerical outputs of the engine will fail the test suite.

## Consequences

**Positive:** Physics outputs are consistent and reproducible. A claim assessed today produces the same physics output as the same claim assessed six months ago, assuming the same input data.

**Negative:** Improvements to the physics model require a formal review process, which adds overhead.

## Alternatives Considered

Versioned physics engines were considered (allowing multiple versions to coexist) but rejected as too complex for the current scale.

## Related Components

`server/accidentPhysics.ts`, `server/pipeline-v2/stage-7-physics.ts`, `server/pipeline-v2/physicsNumericalContract.test.ts`
