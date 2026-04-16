#!/usr/bin/env python3
"""Patch stage-6-damage-analysis.ts to use honest photo accounting metrics."""

import re

path = "server/pipeline-v2/stage-6-damage-analysis.ts"

with open(path, "r") as f:
    content = f.read()

old = """    // ── Image confidence metrics ─────────────────────────────────────────────
    // photosProcessed = how many photos were SENT to the vision LLM.
    // Previously this was gated on visionParts.length > 0, which caused
    // photosProcessed=0 when structured extraction already had components and
    // the vision LLM returned an empty list — triggering a false
    // VISION_ANALYSIS_FAILURE in the forensic validator.
    const photosProcessed = visionSourceUrls.length;
    let imageConfidenceScore = 0;
    if (visionSourceUrls.length > 0) {
      try {
        const enriched: Array<{ confidenceScore: number }> = JSON.parse((ctx as any).enrichedPhotosJson ?? "[]");
        const scored = enriched.filter((e) => e.confidenceScore > 0);
        imageConfidenceScore = scored.length > 0
          ? Math.round(scored.reduce((s, e) => s + e.confidenceScore, 0) / scored.length)
          : 40;
      } catch {
        imageConfidenceScore = 40;
      }
    }
    const analysisFromPhotos = visionParts.length > 0;

    const rawOutput: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
      photosProcessed,
      imageConfidenceScore,
      analysisFromPhotos,
    };"""

new = """    // ── Image confidence metrics (honest accounting) ────────────────────────
    // Use the honest metrics from readDamageFromPhotos:
    //   photosAvailable = total photos in visionSourceUrls
    //   photosProcessed = photos actually sent to the vision LLM
    //   photosDeferred  = photos not processed due to budget
    //   photosFailed    = photos sent to LLM but failed (error/timeout)
    const photosAvailable = visionSourceUrls.length;
    let imageConfidenceScore = 0;
    if (visionPhotosProcessed > 0) {
      try {
        const enriched: Array<{ confidenceScore: number }> = JSON.parse((ctx as any).enrichedPhotosJson ?? "[]");
        const scored = enriched.filter((e) => e.confidenceScore > 0);
        imageConfidenceScore = scored.length > 0
          ? Math.round(scored.reduce((s, e) => s + e.confidenceScore, 0) / scored.length)
          : 40;
      } catch {
        imageConfidenceScore = 40;
      }
    }
    const analysisFromPhotos = visionParts.length > 0;

    const rawOutput: Stage6Output = {
      damagedParts,
      damageZones,
      overallSeverityScore,
      structuralDamageDetected,
      totalDamageArea: claimRecord.accidentDetails.totalDamageAreaM2 || 0,
      photosAvailable,
      photosProcessed: visionPhotosProcessed,
      photosDeferred: visionPhotosDeferred,
      photosFailed: visionPhotosFailed,
      perPhotoResults: visionPerPhotoResults.length > 0 ? visionPerPhotoResults : undefined,
      imageConfidenceScore,
      analysisFromPhotos,
    };"""

if old in content:
    content = content.replace(old, new, 1)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: patched image confidence metrics section")
else:
    print("ERROR: could not find the target block")
    # Show context around the area
    idx = content.find("photosProcessed = visionSourceUrls.length")
    if idx >= 0:
        print(f"Found 'photosProcessed = visionSourceUrls.length' at char {idx}")
        print(repr(content[idx-200:idx+200]))
    else:
        print("Target string not found at all")
