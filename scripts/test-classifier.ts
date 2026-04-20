import { classifyExtractedImages, selectBestImagesForVision } from '../server/pipeline-v2/imageClassifier.js';

async function main() {
  // Simulate the embedded images from the Zimplats PDF
  // colourVar 22-32, 1378x1896, not text-heavy, embedded
  const images = [
    { url: 'http://test/emb-007.jpg', width: 1378, height: 1896, pageNumber: 5, source: 'embedded_image' as const,
      quality: { blurScore: 150, isTextHeavy: false, colourVariance: 32, pixelArea: 1378*1896, aspectRatio: 1378/1896, isUniform: false } },
    { url: 'http://test/emb-008.jpg', width: 1378, height: 1896, pageNumber: 6, source: 'embedded_image' as const,
      quality: { blurScore: 120, isTextHeavy: false, colourVariance: 31, pixelArea: 1378*1896, aspectRatio: 1378/1896, isUniform: false } },
    { url: 'http://test/emb-009.jpg', width: 1378, height: 1896, pageNumber: 7, source: 'embedded_image' as const,
      quality: { blurScore: 100, isTextHeavy: false, colourVariance: 27, pixelArea: 1378*1896, aspectRatio: 1378/1896, isUniform: false } },
    { url: 'http://test/emb-010.jpg', width: 1378, height: 1896, pageNumber: 8, source: 'embedded_image' as const,
      quality: { blurScore: 90, isTextHeavy: false, colourVariance: 22, pixelArea: 1378*1896, aspectRatio: 1378/1896, isUniform: false } },
  ];

  console.log('=== Classifier Test ===');
  const result = await classifyExtractedImages(images, (msg) => console.log('[Classifier]', msg));
  console.log('\n=== Results ===');
  console.log('damagePhotos:', result.damagePhotos.length);
  console.log('fallbackPool:', result.fallbackPool.length);
  console.log('documentPages:', result.documentPages.length);
  for (const img of [...result.damagePhotos, ...result.fallbackPool]) {
    console.log(' -', img.url, 'category:', img.category, 'confidence:', img.confidence.toFixed(2), 'quality:', img.qualityScore);
  }

  console.log('\n=== selectBestImagesForVision ===');
  const { urls, selectionLog } = selectBestImagesForVision(result, 6);
  console.log('Selected URLs:', urls.length);
  for (const l of selectionLog) console.log(' ', l);
  console.log('URLs:', urls);
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
