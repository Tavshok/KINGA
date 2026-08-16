# Annotation Resolution Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The section-annotation resolution mutation loaded a comment by numeric ID alone. A user from another insurer tenant could therefore resolve, assign a disposition to, and create a workflow audit entry for a foreign annotation if the role hierarchy condition happened to pass.

## Correction

Annotation resolution now requires a session tenant and joins the annotation to its parent claim while loading it. The claim tenant must equal the authenticated tenant before role hierarchy is evaluated. The final status update also retains the authorised parent claim ID with the comment ID.

## Verification

The deterministic authority regression passed **2/2**, proving parent-claim tenant resolution before mutation and retention of the authorised claim at the final write. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No comment, annotation, workflow audit, claim, policy, payment, settlement, or financial record changed.

## References

1. [Comments router](../server/routers/comments.ts)
2. [Tenant-authority regression](../server/annotationResolutionTenantAuthority.p0.test.ts)
