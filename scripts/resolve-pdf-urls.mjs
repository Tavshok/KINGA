/**
 * One-time script to resolve PDF fragment URLs in enriched_photos_json
 * for all existing AI assessments.
 * 
 * Run: node scripts/resolve-pdf-urls.mjs
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { createConnection } from 'mysql2/promise';

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = new URL('../.env', import.meta.url).pathname;
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL;
const FORGE_URL = (process.env.BUILT_IN_FORGE_API_URL || '').replace(/\/+$/, '');
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
if (!FORGE_URL || !FORGE_KEY) { console.error('BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY not set'); process.exit(1); }

// ── Storage upload ─────────────────────────────────────────────────────────────
async function uploadPng(pngBuffer, s3Key) {
  const uploadUrl = `${FORGE_URL}/v1/storage/upload?path=${encodeURIComponent(s3Key)}`;
  const blob = new Blob([pngBuffer], { type: 'image/png' });
  const form = new FormData();
  form.append('file', blob, s3Key.split('/').pop());
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FORGE_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.url;
}

// ── Render a single PDF page to PNG buffer ─────────────────────────────────────
function renderPdfPage(pdfPath, pageNumber, dpi = 100) {
  const outDir = join(tmpdir(), `kinga-render-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });
  const prefix = join(outDir, 'page');
  const result = spawnSync('pdftoppm', [
    '-r', String(dpi),
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-png',
    pdfPath,
    prefix,
  ], { stdio: 'pipe' });
  if (result.status !== 0) {
    throw new Error(`pdftoppm failed: ${result.stderr?.toString()}`);
  }
  // pdftoppm output: prefix-000001.png
  const paddedPage = String(pageNumber).padStart(6, '0');
  const pngPath = `${prefix}-${paddedPage}.png`;
  if (!existsSync(pngPath)) {
    // Fallback: find any .png in outDir
    const files = execSync(`ls "${outDir}"`).toString().trim().split('\n').filter(f => f.endsWith('.png'));
    if (files.length === 0) throw new Error(`No PNG output found in ${outDir}`);
    const buf = readFileSync(join(outDir, files[0]));
    execSync(`rm -rf "${outDir}"`);
    return buf;
  }
  const buf = readFileSync(pngPath);
  execSync(`rm -rf "${outDir}"`);
  return buf;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await createConnection(DATABASE_URL);
  console.log('Connected to database');

  const [rows] = await conn.query(
    `SELECT id, claim_id, enriched_photos_json 
     FROM ai_assessments 
     WHERE enriched_photos_json LIKE '%#page=%' 
     ORDER BY id DESC 
     LIMIT 50`
  );

  console.log(`Found ${rows.length} assessments with PDF fragment URLs\n`);

  for (const row of rows) {
    const { id, claim_id, enriched_photos_json } = row;
    let photos;
    try { photos = JSON.parse(enriched_photos_json); } catch { continue; }

    const pdfPattern = /\.pdf#page=(\d+)$/i;
    const pdfFragments = photos.filter(p => p?.url && pdfPattern.test(p.url));
    if (pdfFragments.length === 0) continue;

    console.log(`[Assessment ${id} / Claim ${claim_id}] ${pdfFragments.length} PDF fragment URLs`);

    // Group by base PDF URL
    const byPdf = new Map();
    for (const p of pdfFragments) {
      const m = p.url.match(/^(.+\.pdf)#page=(\d+)$/i);
      if (!m) continue;
      const [, basePdfUrl, pageStr] = m;
      const pageNum = p.pageNumber ?? parseInt(pageStr, 10);
      const idx = p.index ?? photos.indexOf(p);
      if (!byPdf.has(basePdfUrl)) byPdf.set(basePdfUrl, []);
      byPdf.get(basePdfUrl).push({ index: idx, pageNumber: pageNum });
    }

    const resolvedMap = new Map(); // index -> PNG URL

    for (const [basePdfUrl, pages] of byPdf.entries()) {
      const tmpPdfPath = join(tmpdir(), `kinga-pdf-${createHash('md5').update(basePdfUrl).digest('hex').slice(0, 8)}.pdf`);
      try {
        console.log(`  Downloading PDF: ${basePdfUrl.slice(-70)}`);
        execSync(`curl -sL --max-time 120 "${basePdfUrl}" -o "${tmpPdfPath}"`, { stdio: 'pipe' });
        const pdfSize = existsSync(tmpPdfPath) ? readFileSync(tmpPdfPath).length : 0;
        if (pdfSize < 1000) throw new Error(`PDF too small (${pdfSize} bytes)`);
        console.log(`  PDF downloaded: ${Math.round(pdfSize / 1024)}KB`);

        for (const { index, pageNumber } of pages) {
          try {
            console.log(`  Rendering page ${pageNumber}...`);
            const pngBuf = renderPdfPage(tmpPdfPath, pageNumber, 100);
            console.log(`  Page ${pageNumber}: ${Math.round(pngBuf.length / 1024)}KB PNG`);

            const s3Key = `claims/${claim_id}/report-photos/page-${pageNumber}-${Date.now()}.png`;
            const pngUrl = await uploadPng(pngBuf, s3Key);
            resolvedMap.set(index, pngUrl);
            console.log(`  Page ${pageNumber} -> ${pngUrl.slice(-60)}`);
          } catch (err) {
            console.error(`  Page ${pageNumber} failed: ${err.message}`);
          }
        }
      } catch (err) {
        console.error(`  PDF processing failed: ${err.message}`);
      } finally {
        if (existsSync(tmpPdfPath)) unlinkSync(tmpPdfPath);
      }
    }

    if (resolvedMap.size > 0) {
      for (const [idx, pngUrl] of resolvedMap.entries()) {
        const entry = photos.find(p => (p.index ?? photos.indexOf(p)) === idx);
        if (entry) entry.url = pngUrl;
        else if (photos[idx]) photos[idx].url = pngUrl;
      }
      await conn.query(
        'UPDATE ai_assessments SET enriched_photos_json = ? WHERE id = ?',
        [JSON.stringify(photos), id]
      );
      console.log(`  ✓ Updated ${resolvedMap.size}/${pdfFragments.length} URLs in DB\n`);
    } else {
      console.log(`  ✗ No URLs resolved\n`);
    }
  }

  await conn.end();
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
