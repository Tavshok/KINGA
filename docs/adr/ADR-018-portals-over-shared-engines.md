# ADR-018: Portals Over Shared Engines

**Status:** Accepted
**Author:** Tavonga Shoko, Lead Engineer
**Date:** 2026-Q1

## Context

KINGA serves eight distinct user groups through eight portals. Each portal needs to present intelligence in a way appropriate to its users. The question was whether portals should own their intelligence or whether intelligence should be a shared platform layer.

## Decision

Portals orchestrate intelligence — they do not own it. The architecture is **portals over shared engines**: each portal is a thin presentation layer that calls shared intelligence engines via tRPC procedures. No portal has its own physics engine, fraud engine, valuation engine, or cost optimisation engine.

## Consequences

**Positive:** A single improvement to any shared engine benefits all portals. New portals can be added without duplicating intelligence. The platform's intelligence quality improves uniformly as benchmark data grows.

**Negative:** Portal-specific customisation of intelligence outputs requires adding parameters to shared engines rather than forking them, which requires more careful design.

## Alternatives Considered

Portal-specific intelligence was considered for the Engineering Portal (Epic 3) but rejected in favour of the shared CGI engine (`stage-9-5-cgi.ts`) which serves both the claims pipeline and the engineering inspection workflow.

## Related Components

All portal pages in `client/src/pages/`, all tRPC routers in `server/routers/`, all shared engines in `server/pipeline-v2/` and `server/services/`

