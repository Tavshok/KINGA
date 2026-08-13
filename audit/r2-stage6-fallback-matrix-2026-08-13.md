# R2 Stage 6 Fallback Matrix

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Purpose:** Record how every Stage 6 source path retains non-physics damage analysis while allowing numeric crush-depth use only from explicitly eligible evidence.

| Stage 6 path | Damage-analysis behaviour | Crush-depth/physics eligibility | Report disclosure |
|---|---|---|---|
| Dedicated image with confirmed semantic damage classification | Image remains available for visual component analysis. | Eligible only when the semantic evidence envelope confirms a damage photo with sufficient quality and confidence. | Source/classifier/selection metadata plus **Physics: crush-depth eligible**. |
| Dedicated image with missing, weak, or non-damage semantic classification | Image remains available for non-physics component analysis. | Excluded; Stage 6 strips numeric physics fields and Stage 7 requires an explicit confirmed-photo source. | Source warning plus **Physics: contextual only** and a reason. |
| Pre-rendered PDF page classified as a confident damage photo | Page remains available for visual analysis. | Eligible only where the scored-page envelope marks it as a non-fallback, sufficiently confident damage page. | Page, classifier, selection, and physics-eligibility information appear in the shared photo panel. |
| Pre-rendered PDF page selected as fallback, low-confidence, or non-damage | Page remains available for contextual damage analysis. | Excluded from crush-depth measurement. | Explicit fallback warning and **Physics: contextual only**. |
| PDF-direct targeted page render | Page is analysed after the PDF pass identifies it. | Eligible only if the pass identifies a clear vehicle-damage page with visible damage and high/medium scan confidence; otherwise numeric fields are stripped. | Source page, PDF-direct classifier, selection reason, and eligible/contextual boundary. |
| PDF-direct single-pass fallback | PDF components remain available for visual damage context; a rendered page may still appear in reports. | Always excluded because the single-pass path lacks an independently eligible page envelope. | **PDF-direct fallback remains available for contextual damage analysis only** and **Physics: contextual only**. |
| No usable visual evidence / Stage 6 error / description inference | The claim continues through degraded damage analysis with explicit assumptions and recovery actions. | No vision contribution to physics. | The report presents unavailable or qualified evidence rather than a fabricated image-based conclusion. |

## Enforcement Points

`imageEvidenceEligibility.ts` creates typed source envelopes. Stage 6 preserves each envelope in enriched photo evidence and strips unsupported numeric measurements. Stage 7 accepts numeric vision crush depths only where `inputSource` is explicitly `confirmed_damage_photo`. The shared `photoZonePanel()` shows the eligibility boundary in CL, CI, and FR.

> This matrix is intentionally non-blocking. It narrows only numeric physics inputs; it does not suppress claim intake, damage analysis, non-physics visual evidence, report generation, or workflow progression.
