/**
 * test-new-extractor.ts
 * Full end-to-end test of the new pdfjs-based extractor
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { extractImagesWithSummary } from '../server/pdf-image-extractor';

const TOYOTA_HILUX_PDF = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/tenant-1771335377063/ingestion/fdf7053f-a158-4968-a0e8-1d9f881fa529/9cbab418-ff66-469a-bac5-06a38ff71664-O%20RUMUMBA%20TOYOTA%20HILUX%20AFE1914-audit-signed.pdf';

async function main() {
  console.log('=== Testing new pdfjs-based extractor ===\n');
  
  // Download the PDF
  console.log('Fetching Toyota Hilux PDF...');
  const resp = await fetch(TOYOTA_HILUX_PDF);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const pdfBuffer = Buffer.from(await resp.arrayBuffer());
  console.log(`PDF size: ${pdfBuffer.byteLength} bytes\n`);
  
  // Run extraction
  console.log('Running extraction...');
  const summary = await extractImagesWithSummary(pdfBuffer, 'toyota-hilux-test.pdf');
  
  console.log('\n=== EXTRACTION RESULTS ===');
  console.log(`Pages: ${summary.pageCount}`);
  console.log(`Pages rendered: ${summary.pagesRendered}`);
  console.log(`Embedded candidates: ${summary.embeddedCandidates}`);
  console.log(`Images uploaded: ${summary.images.length}`);
  console.log(`Rejected: ${summary.rejectedByDimension}`);
  console.log(`Blurry: ${summary.blurryCount}`);
  console.log(`Text-heavy: ${summary.textHeavyCount}`);
  console.log(`Errors: ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    console.log('Error details:', summary.errors);
  }
  
  console.log('\n=== UPLOADED IMAGES ===');
  for (const img of summary.images) {
    console.log(`  Page ${img.pageNumber} | ${img.source} | ${img.width}x${img.height} | blur=${img.quality.blurScore} | textHeavy=${img.quality.isTextHeavy} | colourVar=${img.quality.colourVariance}`);
    console.log(`    URL: ${img.url.substring(0, 100)}...`);
  }
  
  if (summary.images.length > 0) {
    console.log('\n✅ SUCCESS - Images extracted and uploaded to S3');
  } else {
    console.log('\n❌ FAILED - No images extracted');
    process.exit(1);
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
