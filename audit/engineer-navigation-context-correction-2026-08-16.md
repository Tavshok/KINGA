# Engineer Navigation Context Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The Engineer sidebar previously directed Evidence, Measurements, Observations, KINGA Analysis, Physics Check, and Sign-off to the same generic inspections route. The correction marks these six tasks as context-only: each is available only within an assigned inspection and no longer implies a separate destination. The Asset Passport icon import was also restored so the existing icon metadata is valid at runtime.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 7 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## References

1. [Engineer workspace layout](../client/src/components/EngineerWorkspaceLayout.tsx)
2. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
