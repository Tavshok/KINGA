import { extractImagesFromPDFBuffer } from '../server/pdf-image-extractor';
import { readFileSync } from 'fs';

async function main() {
  const pdfPath = '/home/ubuntu/upload/ZIMPLATSFORDRANGERAFU6364-audit-signed.pdf';
  console.log('📄 Reading PDF from disk...');
  const pdfBuffer = readFileSync(pdfPath);
  console.log(`📄 PDF size: ${pdfBuffer.length} bytes`);
  
  console.log('🔍 Starting extraction...');
  const start = Date.now();
  const images = await extractImagesFromPDFBuffer(pdfBuffer, 'ZIMPLATS-FORD-RANGER-test.pdf');
  const elapsed = Date.now() - start;
  
  console.log(`\n✅ Extraction complete in ${elapsed}ms`);
  console.log(`📸 Total images returned: ${images.length}`);
  
  for (const img of images) {
    console.log(`  - ${img.source} | ${img.width}x${img.height} | url: ${img.url ? img.url.substring(0, 80) + '...' : 'NULL'}`);
  }
  
  const withUrls = images.filter(i => i.url);
  const withoutUrls = images.filter(i => !i.url);
  console.log(`\n  With URL (uploaded): ${withUrls.length}`);
  console.log(`  Without URL (failed): ${withoutUrls.length}`);
}

main().catch(e => console.error('❌ Test failed:', e.message, e.stack));
