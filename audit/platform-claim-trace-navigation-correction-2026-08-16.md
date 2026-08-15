# Platform Claim Trace Navigation Qualification

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The Platform sidebar previously linked Claim Trace to `/platform/claim-trace`, while the authorised route requires a claim identifier at `/platform/claim-trace/:claimId`. The link could therefore lead to a non-existent route.

Claim Trace now renders as an in-context Platform action with the instruction **Open a claim to trace its lifecycle**. It does not navigate until a claim is selected through the authorised claim-specific workflow. No claim, platform authority, or operational data changed.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 9 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## References

1. [Platform layout](../client/src/components/PlatformLayout.tsx)
2. [Platform route registry](../client/src/App.tsx)
3. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
