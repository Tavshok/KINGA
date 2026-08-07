# ADR-015: Gate Never Blocks Policy

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q3

## Context

The intake gate checks quality conditions before the pipeline runs: photo count, document completeness, description length, and other intake quality signals. The question was whether the gate should block assessments that fail quality checks.

## Decision

The gate **never blocks** an assessment. It warns, logs to the notification centre, and allows the pipeline to proceed regardless of quality check results. A claims processor may decide to send a claim to a human assessor rather than the AI pipeline — blocking the pipeline would prevent this.

## Consequences

**Positive:** No claim is ever stuck in the system due to a gate block. Claims processors retain full control over routing decisions. The system never silently prevents an assessment from running.

**Negative:** Low-quality claims may produce low-confidence assessments. The gate's warnings must be visible and actionable to claims processors.

## Alternatives Considered

Hard blocking on minimum photo count was implemented briefly but caused claims processors to complain that legitimate claims (e.g., single-vehicle incidents with one photo) were being blocked. The policy was changed to warn-only.

## Related Components

`server/pipeline-v2/pipelineGateController.ts`, `server/routers/intake-gate.ts`, `server/_core/notification.ts`
