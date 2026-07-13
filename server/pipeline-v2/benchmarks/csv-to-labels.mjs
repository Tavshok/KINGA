/**
 * Phase B-1: Convert tagged CSV to image-classification-labels.json
 *
 * Usage: node server/pipeline-v2/benchmarks/csv-to-labels.mjs
 * Input:  server/pipeline-v2/benchmarks/images-tagged.csv
 * Output: server/pipeline-v2/benchmarks/image-classification-labels.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const VALID_LABELS = new Set([
  'genuine_damage_photo',
  'vehicle_overview',
  'document_page',
  'quotation_scan',
  'pdf_page_with_embedded_damage_photo',
  'pdf_page_document_only',
  'other',
]);

const VALID_CONFIDENCE = new Set(['HIGH', 'MEDIUM', 'LOW']);

const csvPath = join(__dir, 'images-tagged.csv');
const csv = readFileSync(csvPath, 'utf8');
const lines = csv.split('\n').filter(l => l.trim());
const header = lines[0].split(',');

const assessmentIdIdx = header.indexOf('assessment_id');
const claimIdIdx = header.indexOf('claim_id');
const urlIdx = header.indexOf('image_url');
const labelIdx = header.indexOf('ground_truth');
const confIdx = header.indexOf('tagger_confidence');
const notesIdx = header.indexOf('notes');

const labels = [];
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  // Handle quoted fields
  const parts = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g) || [];
  const url = (parts[urlIdx] || '').replace(/^"|"$/g, '').trim();
  const gt = (parts[labelIdx] || '').trim();
  const conf = (parts[confIdx] || '').trim().toUpperCase();
  const notes = (parts[notesIdx] || '').replace(/^"|"$/g, '').trim();
  const assessmentId = parseInt(parts[assessmentIdIdx] || '0', 10);
  const claimId = parseInt(parts[claimIdIdx] || '0', 10);

  if (!url || !gt) { skipped++; continue; }
  if (!VALID_LABELS.has(gt)) {
    console.warn(`Row ${i}: invalid ground_truth "${gt}" — skipping`);
    skipped++;
    continue;
  }
  if (conf && !VALID_CONFIDENCE.has(conf)) {
    console.warn(`Row ${i}: invalid tagger_confidence "${conf}" — defaulting to MEDIUM`);
  }

  labels.push({
    url,
    assessmentId,
    claimId,
    groundTruth: gt,
    taggerConfidence: VALID_CONFIDENCE.has(conf) ? conf : 'MEDIUM',
    ...(notes ? { notes } : {}),
  });
}

const output = {
  version: '1.0',
  created: new Date().toISOString().slice(0, 10),
  description: 'Ground-truth labels for imageClassifier.ts and imageIntelligence.ts evaluation',
  totalLabeled: labels.length,
  skipped,
  distribution: Object.fromEntries(
    [...VALID_LABELS].map(l => [l, labels.filter(x => x.groundTruth === l).length])
  ),
  labels,
};

const outPath = join(__dir, 'image-classification-labels.json');
writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`Written ${labels.length} labels to ${outPath} (${skipped} rows skipped)`);
console.log('Distribution:', output.distribution);
