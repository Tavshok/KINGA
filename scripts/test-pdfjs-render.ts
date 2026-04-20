/**
 * test-pdfjs-render.ts
 * Tests pdfjs-dist + @napi-rs/canvas rendering on the Toyota Hilux PDF
 * Uses a custom canvasFactory to inject @napi-rs/canvas into pdfjs-dist
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as napiCanvas from '@napi-rs/canvas';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';
dotenv.config();

// Set worker path
const workerPath = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

// Custom canvas factory using @napi-rs/canvas
class NapiCanvasFactory {
  create(width: number, height: number) {
    const canvas = napiCanvas.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

async function main() {
  console.log('pdfjs-dist version:', pdfjsLib.version);
  
  // Fetch the Toyota Hilux PDF
  const pdfUrl = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/tenant-1771335377063/ingestion/fdf7053f-a158-4968-a0e8-1d9f881fa529/9cbab418-ff66-469a-bac5-06a38ff71664-O%20RUMUMBA%20TOYOTA%20HILUX%20AFE1914-audit-signed.pdf';
  
  console.log('Fetching PDF...');
  const resp = await fetch(pdfUrl);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const pdfBuffer = Buffer.from(await resp.arrayBuffer());
  console.log('PDF size:', pdfBuffer.byteLength, 'bytes');
  
  // Load with pdfjs using custom canvas factory
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory: new NapiCanvasFactory() as any,
    // Suppress font warnings
    standardFontDataUrl: undefined,
    disableFontFace: true,
  });
  const pdfDoc = await loadingTask.promise;
  console.log('Pages:', pdfDoc.numPages);
  
  // Render first 3 pages
  const DPI = 150;
  const SCALE = DPI / 72;
  
  for (let pageNum = 1; pageNum <= Math.min(3, pdfDoc.numPages); pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    
    const canvas = napiCanvas.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext('2d');
    
    await page.render({
      canvasContext: ctx as any,
      viewport,
    }).promise;
    
    const pngBuffer = canvas.toBuffer('image/png');
    writeFileSync(`/tmp/page-${pageNum}.png`, pngBuffer);
    console.log(`Page ${pageNum}: ${Math.round(viewport.width)}x${Math.round(viewport.height)} → ${pngBuffer.byteLength} bytes → /tmp/page-${pageNum}.png`);
  }
  
  console.log('\n✅ pdfjs-dist + @napi-rs/canvas rendering works!');
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
