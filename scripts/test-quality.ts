import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import sharp from 'sharp';

async function main() {
  // Extract embedded images from the PDF
  execSync('mkdir -p /tmp/z2 && pdfimages -j /home/ubuntu/upload/ZIMPLATSFORDRANGERAFU6364-audit-signed.pdf /tmp/z2/emb 2>/dev/null || true');
  const files = readdirSync('/tmp/z2').filter(f => f.endsWith('.jpg')).slice(0, 5);
  console.log('Embedded JPEGs found:', files.length);
  
  for (const f of files) {
    const buf = readFileSync('/tmp/z2/' + f);
    const meta = await sharp(buf).metadata();
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    
    // Compute colour variance
    const pixels = new Uint8Array(data);
    let sum = 0, sumSq = 0;
    for (let i = 0; i < pixels.length; i++) { sum += pixels[i]; sumSq += pixels[i] * pixels[i]; }
    const n = pixels.length;
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    const colourVariance = Math.round(Math.sqrt(Math.max(0, variance)));
    
    // Check text-heavy (white pixel ratio)
    const channels = info.channels;
    let whiteCount = 0;
    for (let i = 0; i < pixels.length; i += channels) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      if (r > 230 && g > 230 && b > 230) whiteCount++;
    }
    const whiteRatio = whiteCount / (pixels.length / channels);
    const isTextHeavy = whiteRatio > 0.82;
    
    console.log(`${f}: ${meta.width}x${meta.height} | colourVar=${colourVariance} | whiteRatio=${whiteRatio.toFixed(2)} | textHeavy=${isTextHeavy}`);
  }
}

main().catch(e => console.error('FAIL:', e.message));
