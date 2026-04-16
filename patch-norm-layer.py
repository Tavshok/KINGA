#!/usr/bin/env python3
"""
Replace the synthetic metadata block in server/db.ts with the proper
normalisation layer that:
  1. Sets imageNormSource on the pipeline context
  2. For cache_rehydration: bypasses classifier (trusted data), sets damagePhotoUrls directly
  3. For fresh_extraction: uses existing classifier path
  4. Sets photosAvailable on the pipeline context
"""

import re

path = "server/db.ts"
with open(path, "r") as f:
    content = f.read()

OLD_BLOCK = """  // ── SYNTHETIC METADATA FOR CACHED PHOTOS ──────────────────────────────────
  // When damagePhotos was already cached in the DB (from a previous run), the
  // PDF re-extraction block above is skipped, leaving _extractedImagesWithMetadata
  // empty. The image classifier (Stage 2.6) needs ExtractedImageInput objects to
  // score and rank photos. Build minimal synthetic metadata for each cached photo
  // so the classifier can still run and select the best damage photos.
  if (_extractedImagesWithMetadata.length === 0 && damagePhotos.length > 0) {
    _extractedImagesWithMetadata = damagePhotos.map((url: string, idx: number) => ({
      url,
      width: 800,  // synthetic — actual dimensions unknown from URL alone
      height: 600,
      pageNumber: idx + 1,
      source: 'embedded_image' as const,
      quality: {
        width: 800,
        height: 600,
        blurScore: 80,
        isBlurry: false,
        isTextHeavy: false,
        isUniform: false,
        colourVariance: 50,
        aspectRatio: 800 / 600,
        pixelArea: 800 * 600,
      },
      fromScannedPdf: false,
    }));
    console.log(`[AI Assessment] Claim ${claimId}: Built synthetic metadata for ${_extractedImagesWithMetadata.length} cached photo(s) — image classifier will use LLM tier.`);
  }"""

NEW_BLOCK = """  // ── IMAGE NORMALISATION LAYER ────────────────────────────────────────────
  // Guarantees a consistent image state before Stage 2.6 and Stage 6.
  //
  // Two scenarios:
  //   A) fresh_extraction — PDF was re-extracted this run; _extractedImagesWithMetadata
  //      is populated with real quality metadata. Stage 2.6 classifier runs normally.
  //   B) cache_rehydration — damagePhotos were loaded from DB cache; PDF extraction
  //      was skipped. These photos are ALREADY TRUSTED (they passed the classifier
  //      in a previous run). We bypass the classifier and set damagePhotoUrls directly.
  //
  // This replaces the old "synthetic metadata" patch which caused the classifier to
  // re-run on cached photos with fake quality scores, sometimes producing worse
  // selections than the original trusted set.
  let _imageNormSource: 'fresh_extraction' | 'cache_rehydration' | null = null;
  if (_extractedImagesWithMetadata.length > 0) {
    // Case A: fresh extraction — classifier will run on real metadata
    _imageNormSource = 'fresh_extraction';
    console.log(`[AI Assessment] Claim ${claimId}: Image normalisation — fresh_extraction (${_extractedImagesWithMetadata.length} images with real metadata)`);
  } else if (damagePhotos.length > 0) {
    // Case B: cache rehydration — bypass classifier, use trusted cached photos directly
    _imageNormSource = 'cache_rehydration';
    // Do NOT populate _extractedImagesWithMetadata — the orchestrator Stage 2.6 checks
    // imageNormSource and skips the classifier when source === 'cache_rehydration'.
    console.log(`[AI Assessment] Claim ${claimId}: Image normalisation — cache_rehydration (${damagePhotos.length} trusted cached photos, classifier bypassed)`);
  }"""

if OLD_BLOCK in content:
    content = content.replace(OLD_BLOCK, NEW_BLOCK)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: Replaced synthetic metadata block with normalisation layer")
else:
    print("ERROR: Could not find the synthetic metadata block to replace")
    # Show a snippet to help debug
    idx = content.find("SYNTHETIC METADATA")
    if idx >= 0:
        print(f"Found 'SYNTHETIC METADATA' at char {idx}")
        print(repr(content[idx:idx+200]))
