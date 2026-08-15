# Platform Sidebar Link Rendering Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The Platform Administration sidebar previously nested anchor elements inside wouter `Link` components. This produces invalid navigation markup and can cause client rendering or navigation inconsistency. The correction applies sidebar classes directly to each `Link`, including the footer return link, so every platform navigation item emits a single valid anchor.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 8 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## References

1. [Platform layout](../client/src/components/PlatformLayout.tsx)
2. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
