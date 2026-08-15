# Engineer Sidebar Stability Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

The Engineer workspace sidebar previously declared Projects and Asset Passport without icon metadata, then rendered every navigation icon unconditionally. This could create an invalid React element and prevent the professional workspace from rendering.

The correction supplies `FolderOpen` for Projects and `FileText` for Asset Passport. The renderer now also uses `FolderOpen` as a defensive presentation fallback for any future sidebar entry missing an icon. This is limited to navigation presentation and does not change inspection data, permissions, assignments, workflow, or financial outcomes.

| Validation | Result |
|---|---|
| Professional portal conformance regression | 7 tests passed |
| Bundled server build | Passed |
| Vite production build | Passed; existing large-chunk warning only |

## References

1. [Engineer workspace layout](../client/src/components/EngineerWorkspaceLayout.tsx)
2. [Portal conformance regression](../server/professionalPortalConformance.p1.test.ts)
