#!/usr/bin/env python3
"""
Patch stage-3-structured-extraction.ts:
1. Replace the inline dedup block + STEP 3-5 with calls to the new helper functions.
2. Add the explicit no-split rationale comment above the five-path quote extraction block.
"""
import sys

FILE = 'server/pipeline-v2/stage-3-structured-extraction.ts'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# ── PATCH 1: Replace dedup block + STEP 3-5 with helper calls ──────────────────

# Find the dedup block start (uses unicode box-drawing dashes)
DEDUP_START = '  // \u2500\u2500 FINAL DEDUPLICATION: collapse same-repairer quotes'

# Find the end of STEP 5 (the last line before `return {`)
STEP5_END_MARKER = '    flags.push("ocr_failure");\n  }\n\n  return {'
STEP5_END_REPLACEMENT = '    flags.push("ocr_failure");\n  }\n\n  return {'  # keep return { intact

dedup_start_idx = content.find(DEDUP_START)
step5_end_idx = content.find(STEP5_END_MARKER)

if dedup_start_idx == -1:
    print('ERROR: dedup start not found', file=sys.stderr)
    sys.exit(1)
if step5_end_idx == -1:
    print('ERROR: step5 end not found', file=sys.stderr)
    sys.exit(1)

# The replacement ends just before `  return {`
# We want to replace from dedup_start_idx up to (but not including) `  return {`
end_of_step5 = step5_end_idx + len('    flags.push("ocr_failure");\n  }\n')

OLD_BLOCK = content[dedup_start_idx:end_of_step5]

NEW_BLOCK = (
    '  // \u2500\u2500 FINAL DEDUPLICATION: collapse same-repairer quotes (via deduplicateExtractedQuotes) \u2500\u2500\n'
    '  if (extracted_quotes && extracted_quotes.length > 1) {\n'
    '    extracted_quotes = deduplicateExtractedQuotes(extracted_quotes);\n'
    '  }\n'
    '\n'
    '  // STEP 3 \u2014 Image presence detection (via detectImagePresence)\n'
    '  const { imagesPresent: images_present, imagesNotProcessed } = detectImagePresence(stage1, perDocumentExtractions);\n'
    "  if (imagesNotProcessed) flags.push('images_not_processed');\n"
    '\n'
    '  // STEP 4 \u2014 Damage hint extraction\n'
    '  const damage_hints = extractDamageHints(allText);\n'
    '\n'
    '  // STEP 5 \u2014 OCR failure detection (via detectOcrFailure)\n'
    "  if (detectOcrFailure(allText, stage1.documents.length)) flags.push('ocr_failure');\n"
)

content = content[:dedup_start_idx] + NEW_BLOCK + content[end_of_step5:]
print(f'PATCH 1 applied: replaced {len(OLD_BLOCK)} chars with {len(NEW_BLOCK)} chars')

# ── PATCH 2: Add no-split rationale comment above the five-path block ──────────

# Find the five-path block start (the STEP 2b comment)
FIVEPATH_MARKER = '  // STEP 2b \u2014 LLM-based structured quote extraction'
fivepath_idx = content.find(FIVEPATH_MARKER)
if fivepath_idx == -1:
    print('ERROR: five-path block marker not found', file=sys.stderr)
    sys.exit(1)

NO_SPLIT_COMMENT = (
    '  // \u2500\u2500 FIVE-PATH QUOTE EXTRACTION BLOCK \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'
    '  //\n'
    '  // This block is intentionally NOT split into sub-functions.\n'
    '  //\n'
    '  // The five extraction paths (primary vision, vision fallback, unconditional vision pass,\n'
    '  // OCR-failure vision-direct, text-based fallback) share mutable state:\n'
    '  //   extracted_quotes, extractedNamesNorm, allPdfDocs, pdfPageImages, hintTotalCents\n'
    '  //\n'
    '  // The R-A-15 fix (2026-06) depends on claimQuoteTotalHintCents flowing correctly into\n'
    '  // the OCR-failure path, and the R-A-16 fix (2026-06) depends on deduplication running\n'
    '  // AFTER all five paths have contributed to extracted_quotes. Splitting this block into\n'
    '  // sub-functions would require passing 6+ variables as parameters and risks reintroducing\n'
    '  // the bugs those fixes resolved.\n'
    '  //\n'
    '  // If a future change requires touching this block, treat it as a single unit and\n'
    '  // re-verify against the R-A-15/R-A-16 test coverage before committing.\n'
    '  //\n'
    '  // \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'
    '\n'
)

content = content[:fivepath_idx] + NO_SPLIT_COMMENT + content[fivepath_idx:]
print(f'PATCH 2 applied: inserted no-split rationale comment ({len(NO_SPLIT_COMMENT)} chars) before five-path block')

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done.')
