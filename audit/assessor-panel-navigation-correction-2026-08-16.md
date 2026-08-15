# Assessor and Panel-Beater Navigation Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The Assessor and Panel-Beater sidebars previously represented several distinct tools as separate links while directing each link to the same dashboard. This could imply a destination that did not exist and leave users unable to understand where the relevant task was performed.

The correction retains the visible tool labels but makes their scope explicit. Assessment Form and Documents are now marked as available only inside an assigned assessor claim. Quote Requests, Quote History, Performance, and Documents are marked as available inside the active panel-beater claim/quote workspace. Context-only items are non-navigable and explain the next authorised action rather than redirecting users to an indistinguishable dashboard.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 7 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed after correcting the active-state expression syntax surfaced by the build; existing large-chunk warning only |

## References

1. [Assessor portal layout](../client/src/components/AssessorPortalLayout.tsx)
2. [Panel-beater portal layout](../client/src/components/PanelBeaterPortalLayout.tsx)
3. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
