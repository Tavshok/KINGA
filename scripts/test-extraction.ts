import { extractImagesFromPDFBuffer } from '../server/pdf-image-extractor';
import { classifyExtractedImages, selectBestImagesForVision } from '../server/pipeline-v2/imageClassifier';
import { readFileSync } from 'fs';

async function main() {
  const pdfPath = '/home/ubuntu/upload/ZIMPLATSFORDRANGERAFU6364-audit-signed.pdf';
  console.log('📄 Reading PDF from disk...');
  const pdfBuffer = readFileSync(pdfPath);
  console.log(`📄 PDF size: ${pdfBuffer.length} bytes`);
  
  console.log('\n🔍 STEP 1: Extracting images from PDF...');
  const start = Date.now();
  const images = await extractImagesFromPDFBuffer(pdfBuffer, 'ZIMPLATS-FORD-RANGER-test.pdf');
  const elapsed = Date.now() - start;
  
  console.log(`\n✅ Extraction complete in ${elapsed}ms`);
  console.log(`📸 Total images returned: ${images.length}`);
  
  for (const img of images) {
    const q = img.quality;
    console.log(`  - [${img.source}] ${img.width}x${img.height} | url=${img.url ? 'OK' : 'NULL'} | textHeavy=${q?.isTextHeavy} colourVar=${q?.colourVariance} blur=${q?.blurScore} uniform=${q?.isUniform}`);
  }
  
  const withUrls = images.filter(i => i.url);
  const withoutUrls = images.filter(i => !i.url);
  console.log(`\n  With URL (uploaded to S3): ${withUrls.length}`);
  console.log(`  Without URL (S3 upload failed): ${withoutUrls.length}`);

  if (withUrls.length === 0) {
    console.error('\n❌ CRITICAL: No images were uploaded to S3 — Stage 6 will have nothing to work with');
    return;
  }

  console.log('\n🔍 STEP 2: Running image classifier (Stage 2.6)...');
  const classified = await classifyExtractedImages(images, (msg) => console.log(`  [Classifier] ${msg}`));
  
  console.log('\n📊 Classification results:');
  console.log(`  damage_photo: ${classified.summary.damagePhotoCount}`);
  console.log(`  vehicle_overview: ${classified.summary.vehicleOverviewCount}`);
  console.log(`  quotation_scan: ${classified.summary.quotationCount}`);
  console.log(`  document_page: ${classified.summary.documentPageCount}`);
  console.log(`  fallback: ${classified.summary.fallbackCount}`);
  console.log(`  duplicates_removed: ${classified.summary.duplicatesRemoved}`);

  const { urls: bestUrls, selectionLog } = selectBestImagesForVision(classified);
  console.log(`\n🎯 Best images selected for Stage 6 vision: ${bestUrls.length}`);
  for (const line of selectionLog) {
    console.log(`  ${line}`);
  }

  if (bestUrls.length === 0) {
    console.error('\n❌ CRITICAL: Classifier produced 0 images for Stage 6 — vision analysis will fail');
    console.log('  Fallback pool:', classified.fallbackPool.length, 'images');
  } else {
    console.log('\n✅ SUCCESS: Pipeline would pass', bestUrls.length, 'image(s) to Stage 6 vision analysis');
  }
}

main().catch(e => console.error('❌ Test failed:', e.message, e.stack));
