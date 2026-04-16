# Image Processing Architecture — Design Principles

**Date**: 2026-04-16  
**Status**: Authoritative — all pipeline image processing must conform to these rules.

---

## The Core Problem We Are Solving

Insurance claims with photos require that **every photo is accounted for**. A system that silently skips photos, caps processing without audit trail, or reports "processed" when it only looked at a subset is a liability — not an asset. Missed damage in an unprocessed photo could mean an underpaid claim or an undetected fraud.

---

## Principles

### 1. Every photo must be accounted for — no silent skips

Every photo URL in `damagePhotoUrls` must appear in the pipeline output with one of three statuses:
- `PROCESSED` — sent to vision LLM, result recorded
- `SKIPPED_INACCESSIBLE` — URL returned HTTP 4xx/5xx, logged with URL and HTTP status
- `SKIPPED_BUDGET` — not processed due to LLM cost/time budget, logged with reason

There is no fourth option. A photo cannot disappear from the audit trail.

### 2. Caps are budget decisions, not design decisions — they must be explicit and auditable

If we cannot process all photos in a single run (e.g., 29 photos × 45s = 21 minutes), that is a **budget constraint** that must be:
- Explicitly logged: "29 photos available, 10 processed (budget cap), 19 deferred"
- Recorded in the assumption registry with confidence impact
- Surfaced in the forensic audit as `photosAvailable`, `photosProcessed`, `photosDeferred`
- Never reported as "29 photos processed" when only 10 were

### 3. Batched processing — not a single-pass cap

When there are more photos than the per-run budget, the system must process them in batches across multiple LLM calls, not silently drop the overflow. If the total budget is exceeded, the deferred photos are recorded and the claim is flagged for supplementary analysis.

### 4. Photo selection must be principled, not arbitrary

When a budget cap applies, the selection of which photos to process must be based on:
- **Damage likelihood score** (from the Image Intelligence Layer) — process highest-scoring first
- **Uniqueness** — deduplicate near-identical photos before processing
- **Coverage** — ensure at least one photo from each damage zone is processed

Never use `slice(0, N)` — that is arbitrary positional selection with no damage-relevance reasoning.

### 5. Vision results must be traceable to source photos

Every damage component in the final list must carry a `sourcePhotoIndex` or `sourcePhotoUrl` field indicating which photo it came from. This allows auditors to verify: "the rear bumper deformation was detected in photo 3 (rear_damage_01.jpg)."

### 6. The `photosProcessed` field must be honest

`photosProcessed` = number of photos actually sent to the vision LLM and for which a result was received (success or failure).  
`photosAvailable` = total number of damage photos in the claim.  
`photosDeferred` = photos available but not processed in this run due to budget.  
`photosFailed` = photos that were sent to the LLM but failed (timeout, error, inaccessible URL).

The forensic validator uses `photosProcessed / photosAvailable` as a coverage metric. If coverage < 100%, the claim is flagged for supplementary analysis, not failed.

### 7. Direction filtering is a safeguard, not a suppressor

The direction-aware filter (e.g., exclude front-zone components from a rear-end collision) is correct and must remain. But it must:
- Log every exclusion with the reason
- Record excluded components in an `excludedComponents` field (not silently drop them)
- Allow a human reviewer to override exclusions

### 8. Photo forensics (Python EXIF/GPS analysis) is a separate concern from vision analysis

Photo forensics checks for manipulation, EXIF data, GPS consistency. Vision analysis identifies damage components. These are independent. A failure in photo forensics (e.g., Python script error) must NOT affect the vision analysis result or the fraud score from vision evidence.

---

## Implementation Contract for Stage 6

```typescript
interface Stage6Output {
  damagedParts: DamageAnalysisComponent[];  // final filtered list
  damageZones: DamageZone[];
  overallSeverityScore: number;
  structuralDamageDetected: boolean;
  totalDamageArea: number;
  
  // Honest photo accounting
  photosAvailable: number;      // total photos in damagePhotoUrls
  photosProcessed: number;      // actually sent to vision LLM
  photosDeferred: number;       // available but not processed (budget)
  photosFailed: number;         // sent but failed (error/timeout/inaccessible)
  
  imageConfidenceScore: number;
  analysisFromPhotos: boolean;
  
  // Audit trail
  perPhotoResults: PerPhotoResult[];  // one entry per available photo
  excludedComponents: ExcludedComponent[];  // direction-filtered components
}

interface PerPhotoResult {
  url: string;
  status: 'PROCESSED' | 'SKIPPED_INACCESSIBLE' | 'SKIPPED_BUDGET';
  components: DamageAnalysisComponent[];  // empty if not processed
  confidence: 'high' | 'medium' | 'low';
  httpStatus?: number;  // for SKIPPED_INACCESSIBLE
  deferralReason?: string;  // for SKIPPED_BUDGET
}

interface ExcludedComponent {
  name: string;
  zone: string;
  reason: string;  // e.g., "front zone incompatible with rear collision"
  sourcePhotoUrl?: string;
}
```

---

## What Changes in the Implementation

1. **Remove `MAX_VISION_PHOTOS` hard cap** — replace with principled batching
2. **Add `photosAvailable`, `photosDeferred` fields** to Stage6Output
3. **Add `perPhotoResults` audit trail** — one entry per available photo
4. **Add `excludedComponents` field** — direction-filtered parts remain visible
5. **Update `photosProcessed`** to reflect only photos actually sent to LLM
6. **Update forensic validator** to use `photosProcessed / photosAvailable` as coverage metric
7. **Photo selection** uses damage likelihood scores, not `slice(0, N)`

---

## Permanent Rules (never revert)

- `high_cost_per_component` fraud indicator is PERMANENTLY DISABLED. Total cost ÷ component count is not a valid fraud signal. Only per-part benchmark deviations are valid.
- `NARRATIVE_PHYSICS_MISMATCH` from speed inconsistency is a physics finding, NOT a fraud signal.
- Photo forensics failure (Python EXIF script) does NOT affect vision analysis results.
- Every photo must appear in `perPhotoResults` — no silent drops.
