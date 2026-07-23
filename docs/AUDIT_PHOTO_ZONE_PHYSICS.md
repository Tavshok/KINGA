# Audit: Photo Forensics Zone-Mapping & Physics Dimension Engine

## 1. Photo Forensics Zone-Mapping

### What exists
- `photoZonePanel()` function in `server/reporting/templates/kingaDesignSystem.ts` (line 605)
  - Takes array of `{url, zone?, caption?, usable?}` objects
  - Renders a 4-column photo grid with zone label, caption, and usability flag
  - **EXPORTED but NEVER CALLED** — grep confirms zero callers in any report generator

### Current state in reports
- `forensicDecisionReport.ts` §08 renders photos using inline code (lines 856–884)
  - Uses `enrichedPhotos` array from `ai_assessments.enriched_photos_json`
  - Each photo has `impactZone`, `severity`, `confidenceScore`, `url`, `caption` fields
  - Photos are rendered in a `.photo-grid` (4 tiles) with zone pill and severity pill
  - **Zone labels ARE shown** via `d.impactZone` — so zone data IS displayed
  - BUT: the `photoZonePanel()` helper (which has the cleaner zone-label design) is NOT used

### What "redesigned photo forensics by zoning" likely refers to
- The `photoZonePanel()` function was designed as the canonical zone-aware photo renderer
- It was built but never wired into the report generators
- The forensic report uses its own inline photo grid instead

### Verdict: PARTIALLY ACTIVE
- Zone data (impactZone) IS populated by Stage 6 and stored in enriched_photos_json ✓
- Zone data IS shown in the forensic report (inline rendering) ✓
- The `photoZonePanel()` helper is DEAD CODE — built but never called ✗
- The Protect tier (claimsIntelligenceReport.ts) §4 does NOT show per-photo zones ✗

### Fix needed
- Wire `photoZonePanel()` into forensicDecisionReport.ts §08 (replace inline grid)
- Wire `photoZonePanel()` into claimsIntelligenceReport.ts §4 Evidence Snapshot
- Pass enrichedPhotos mapped to `{url, zone: p.impactZone, caption: p.caption, usable: p.confidenceScore >= 70}`

---

## 2. Vehicle Dimension / Physics Precision Engine

### What to look for
- Files: stage-7-physics.ts, speedInferenceEnsemble.ts, physicsVectorDirection.ts
- Look for: vehicleDimensions, crushDepth, dimension-based physics calculations
- Key question: is there a vehicle dimension lookup that feeds into physics precision?

### Files to check
- `/home/ubuntu/kinga-replit/server/pipeline-v2/stage-7-physics.ts`
- `/home/ubuntu/kinga-replit/server/pipeline-v2/speedInferenceEnsemble.ts`
- `/home/ubuntu/kinga-replit/server/vehicle-registry.ts`
- `/home/ubuntu/kinga-replit/server/pipeline-v2/stage-6-5b-vgr.ts` (VGR = Vehicle Geometry Reconstruction?)

### Status: TO BE CHECKED
