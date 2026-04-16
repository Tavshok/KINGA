#!/usr/bin/env python3
"""
Fix the Stage 2.6 block in orchestrator.ts:
1. Remove the misplaced Stage 2.6 comment from inside the catch block
2. Fix the double-brace {{ on the else-if line
3. Add the missing try { before the classifier call
4. Restore the Stage 2.6 block to its correct position (after the catch block)
"""

path = "server/pipeline-v2/orchestrator.ts"
with open(path, "r") as f:
    content = f.read()

# The current broken state has:
# 1. Stage 2.6 comment inside the catch block (after line 640)
# 2. Double-brace {{ on the else-if line
# 3. Missing try { before the classifier call

OLD = """    } catch (domainCorrErr) {
      ctx.log("Stage 2.5", `Domain corrector error (non-fatal): ${String(domainCorrErr)}`);
    }
    // ── STAGE 2.6: Image Classification Layer ─────────────────────────────────────────────
  // Classifies extracted images into damage_photo, vehicle_overview, quotation_scan,
  // document_page, or fallback. Uses 3-tier system: heuristic scoring → LLM classification
  // → quality-based selection. No images are ever discarded — low-confidence go to fallbackPool.
  //
  // NORMALISATION GATE: When imageNormSource === 'cache_rehydration', the photos were
  // already classified and trusted in a previous pipeline run. Bypass the classifier
  // entirely — re-classifying with synthetic metadata produces worse selections.
  if (ctx.imageNormSource === 'cache_rehydration' && ctx.damagePhotoUrls.length > 0) {
    ctx.log('Stage 2.6', `Bypassing classifier — cache_rehydration: ${ctx.damagePhotoUrls.length} trusted cached photo(s) used directly (no re-classification needed)`);
    // Record as assumption so the forensic report knows the source
    allAssumptions.push({
      field: 'imageClassification',
      assumedValue: JSON.stringify({ source: 'cache_rehydration', count: ctx.damagePhotoUrls.length }),
      reason: `Image classifier bypassed — photos were already classified and trusted in a previous run (cache_rehydration). Using ${ctx.damagePhotoUrls.length} cached damage photo(s) directly.`,
      strategy: 'domain_correction',
      confidence: 90,
      stage: 'Stage 2.6',
    });
  } else if (ctx.extractedImagesWithMetadata && ctx.extractedImagesWithMetadata.length > 0) {{
      const { classifyExtractedImages, selectBestImagesForVision } = await import('./imageClassifier');
      const classified = await classifyExtractedImages(
        ctx.extractedImagesWithMetadata,
        (msg: string) => ctx.log('Stage 2.6', msg)
      );
      ctx.classifiedImages = classified;

      // Replace damagePhotoUrls with quality-ranked classified damage photos
      const { urls: bestUrls, selectionLog } = selectBestImagesForVision(classified);
      if (bestUrls.length > 0) {
        ctx.damagePhotoUrls = bestUrls;
        ctx.log('Stage 2.6', `Selected ${bestUrls.length} best images for vision analysis (from ${classified.summary.totalInput} total)`);
      } else if (classified.summary.fallbackCount > 0) {
        // No confident damage photos — use fallback pool
        ctx.damagePhotoUrls = classified.fallbackPool.map(img => img.url).slice(0, 6);
        ctx.log('Stage 2.6', `No confident damage photos — using ${ctx.damagePhotoUrls.length} fallback image(s)`);
      } else {
        ctx.log('Stage 2.6', `NO_DAMAGE_PHOTOS_PROVIDED: ${classified.summary.documentPageCount} document pages, ${classified.summary.quotationCount} quotation scans, 0 damage photos`);
        // Don't clear damagePhotoUrls — let Stage 6 handle the empty case
      }

      for (const line of selectionLog) {
        ctx.log('Stage 2.6', line);
      }

      // Log classification summary as an assumption for the forensic report
      allAssumptions.push({
        field: 'imageClassification',
        assumedValue: JSON.stringify(classified.summary),
        reason: `Image classifier: ${classified.summary.damagePhotoCount} damage photos, ${classified.summary.vehicleOverviewCount} overviews, ${classified.summary.quotationCount} quotations, ${classified.summary.documentPageCount} documents, ${classified.summary.fallbackCount} fallback (${classified.summary.duplicatesRemoved} duplicates removed, avg confidence: ${classified.summary.averageConfidence})`,
        strategy: 'domain_correction',
        confidence: Math.round(classified.summary.averageConfidence * 100),
        stage: 'Stage 2.6',
      });
    } catch (classifierErr) {
      ctx.log('Stage 2.6', `Image classifier error (non-fatal): ${String(classifierErr)} — using unclassified images`);
    }
  } else {
    ctx.log('Stage 2.6', 'No extracted image metadata available — skipping classification (using raw damagePhotoUrls)');
  }"""

NEW = """    } catch (domainCorrErr) {
      ctx.log("Stage 2.5", `Domain corrector error (non-fatal): ${String(domainCorrErr)}`);
    }
  }

  // ── STAGE 2.6: Image Classification Layer ─────────────────────────────────
  // Classifies extracted images into damage_photo, vehicle_overview, quotation_scan,
  // document_page, or fallback. Uses 3-tier system: heuristic scoring → LLM classification
  // → quality-based selection. No images are ever discarded — low-confidence go to fallbackPool.
  //
  // NORMALISATION GATE: When imageNormSource === 'cache_rehydration', the photos were
  // already classified and trusted in a previous pipeline run. Bypass the classifier
  // entirely — re-classifying with synthetic metadata produces worse selections.
  if (ctx.imageNormSource === 'cache_rehydration' && ctx.damagePhotoUrls.length > 0) {
    ctx.log('Stage 2.6', `Bypassing classifier — cache_rehydration: ${ctx.damagePhotoUrls.length} trusted cached photo(s) used directly (no re-classification needed)`);
    // Record as assumption so the forensic report knows the source
    allAssumptions.push({
      field: 'imageClassification',
      assumedValue: JSON.stringify({ source: 'cache_rehydration', count: ctx.damagePhotoUrls.length }),
      reason: `Image classifier bypassed — photos were already classified and trusted in a previous run (cache_rehydration). Using ${ctx.damagePhotoUrls.length} cached damage photo(s) directly.`,
      strategy: 'domain_correction',
      confidence: 90,
      stage: 'Stage 2.6',
    });
  } else if (ctx.extractedImagesWithMetadata && ctx.extractedImagesWithMetadata.length > 0) {
    try {
      const { classifyExtractedImages, selectBestImagesForVision } = await import('./imageClassifier');
      const classified = await classifyExtractedImages(
        ctx.extractedImagesWithMetadata,
        (msg: string) => ctx.log('Stage 2.6', msg)
      );
      ctx.classifiedImages = classified;

      // Replace damagePhotoUrls with quality-ranked classified damage photos
      const { urls: bestUrls, selectionLog } = selectBestImagesForVision(classified);
      if (bestUrls.length > 0) {
        ctx.damagePhotoUrls = bestUrls;
        ctx.log('Stage 2.6', `Selected ${bestUrls.length} best images for vision analysis (from ${classified.summary.totalInput} total)`);
      } else if (classified.summary.fallbackCount > 0) {
        // No confident damage photos — use fallback pool
        ctx.damagePhotoUrls = classified.fallbackPool.map(img => img.url).slice(0, 6);
        ctx.log('Stage 2.6', `No confident damage photos — using ${ctx.damagePhotoUrls.length} fallback image(s)`);
      } else {
        ctx.log('Stage 2.6', `NO_DAMAGE_PHOTOS_PROVIDED: ${classified.summary.documentPageCount} document pages, ${classified.summary.quotationCount} quotation scans, 0 damage photos`);
        // Don't clear damagePhotoUrls — let Stage 6 handle the empty case
      }

      for (const line of selectionLog) {
        ctx.log('Stage 2.6', line);
      }

      // Log classification summary as an assumption for the forensic report
      allAssumptions.push({
        field: 'imageClassification',
        assumedValue: JSON.stringify(classified.summary),
        reason: `Image classifier: ${classified.summary.damagePhotoCount} damage photos, ${classified.summary.vehicleOverviewCount} overviews, ${classified.summary.quotationCount} quotations, ${classified.summary.documentPageCount} documents, ${classified.summary.fallbackCount} fallback (${classified.summary.duplicatesRemoved} duplicates removed, avg confidence: ${classified.summary.averageConfidence})`,
        strategy: 'domain_correction',
        confidence: Math.round(classified.summary.averageConfidence * 100),
        stage: 'Stage 2.6',
      });
    } catch (classifierErr) {
      ctx.log('Stage 2.6', `Image classifier error (non-fatal): ${String(classifierErr)} — using unclassified images`);
    }
  } else {
    ctx.log('Stage 2.6', 'No extracted image metadata available — skipping classification (using raw damagePhotoUrls)');
  }"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: Fixed Stage 2.6 block structure in orchestrator.ts")
else:
    print("ERROR: Could not find the broken Stage 2.6 block")
    # Find the approximate location
    idx = content.find("STAGE 2.6")
    if idx >= 0:
        print(f"Found 'STAGE 2.6' at char {idx}")
        # Show surrounding context
        start = max(0, idx - 200)
        end = min(len(content), idx + 500)
        print(repr(content[start:end]))
