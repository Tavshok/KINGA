# Insurer Workflow Settings Navigation-Domain Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The insurer-admin sidebar previously linked Workflow Settings to `/admin/workflows`, a platform-administration destination outside the insurer portal domain. The correction retains the entry as an explicit unavailable state labelled **Managed by platform administration**. It no longer redirects an insurer administrator to a separate administration domain or implies tenant workflow-configuration authority that is not available in the insurer portal.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 7 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed after correcting the sidebar active-state expression syntax; existing large-chunk warning only |

## References

1. [Insurer portal layout](../client/src/components/InsurerPortalLayout.tsx)
2. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
