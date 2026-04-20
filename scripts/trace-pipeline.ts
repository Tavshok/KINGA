/**
 * trace-pipeline.ts
 * 
 * Directly traces what triggerAiAssessment does for a claim:
 * 1. Fetches the claim from DB
 * 2. Resolves pdfUrl (sourceDocumentId → ingestion_documents.s3Url)
 * 3. Checks if damagePhotos is empty
 * 4. Runs extractImagesFromPDFBuffer on the PDF
 * 5. Reports exactly how many images were extracted and their quality
 * 
 * This bypasses the full pipeline and just tests the extraction path.
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Use the Toyota Hilux claim (DOC-20260420-C9031525, ID 4500006)
  const claimId = 4500006;
  
  console.log('=== Tracing pipeline for claim', claimId, '===\n');
  
  // Step 1: Fetch claim
  const [claimRows] = await conn.execute(
    `SELECT id, claim_number, source_document_id, damage_photos, external_assessment_url, document_processing_status
     FROM claims WHERE id = ? LIMIT 1`,
    [claimId]
  ) as any[];
  
  if (!claimRows.length) { console.log('CLAIM NOT FOUND'); await conn.end(); return; }
  const claim = claimRows[0];
  console.log('Claim:', claim.claim_number);
  console.log('sourceDocumentId:', claim.source_document_id);
  console.log('damage_photos raw:', claim.damage_photos);
  console.log('document_processing_status:', claim.document_processing_status);
  
  // Step 2: Resolve PDF URL
  let pdfUrl: string | null = null;
  if (claim.source_document_id) {
    const [docRows] = await conn.execute(
      'SELECT id, s3_url, original_filename, extraction_status FROM ingestion_documents WHERE id = ? LIMIT 1',
      [claim.source_document_id]
    ) as any[];
    
    if (docRows.length) {
      const doc = docRows[0];
      console.log('\nSource document:', doc.id, doc.original_filename);
      console.log('extraction_status:', doc.extraction_status);
      console.log('s3_url:', doc.s3_url ? doc.s3_url.substring(0, 120) : 'NULL');
      pdfUrl = doc.s3_url ? doc.s3_url.replace(/ /g, '%20') : null;
    } else {
      console.log('\nWARNING: source_document_id', claim.source_document_id, 'not found in ingestion_documents!');
    }
  }
  
  // Step 3: Check damagePhotos
  const damagePhotos = claim.damage_photos ? JSON.parse(claim.damage_photos) : [];
  console.log('\ndamagePhotos array length:', damagePhotos.length);
  console.log('pdfUrl found:', !!pdfUrl);
  console.log('Will extract from PDF:', !!(pdfUrl && damagePhotos.length === 0));
  
  await conn.end();
  
  if (!pdfUrl) {
    console.log('\n❌ NO PDF URL — extraction cannot run. This is the root cause.');
    return;
  }
  
  if (damagePhotos.length > 0) {
    console.log('\n⚠️  damagePhotos already populated — extraction skipped (cache_rehydration path)');
    console.log('Photos:', damagePhotos.slice(0, 2));
    return;
  }
  
  // Step 4: Test PDF fetch
  console.log('\n=== Testing PDF fetch ===');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let fetchOk = false;
  let pdfSize = 0;
  try {
    const resp = await fetch(pdfUrl, { signal: controller.signal });
    clearTimeout(timeout);
    fetchOk = resp.ok;
    console.log('PDF fetch status:', resp.status, resp.statusText);
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      pdfSize = buf.byteLength;
      console.log('PDF size:', pdfSize, 'bytes');
      
      // Step 5: Run extraction
      console.log('\n=== Running extractImagesFromPDFBuffer ===');
      const { extractImagesFromPDFBuffer } = await import('../server/pdf-image-extractor.js');
      const images = await extractImagesFromPDFBuffer(buf, 'trace-test.pdf');
      console.log('Total images extracted:', images.length);
      const passing = images.filter((img: any) => img.width >= 200 && img.height >= 200);
      console.log('Passing dimension gate (>=200px):', passing.length);
      
      for (const img of passing.slice(0, 5)) {
        console.log(` - ${img.source} ${img.width}x${img.height} blur=${img.quality?.blurScore?.toFixed(0)} textHeavy=${img.quality?.isTextHeavy} url=${img.url?.substring(0, 80)}`);
      }
      
      if (passing.length === 0) {
        console.log('\n❌ ZERO images pass the dimension gate — this is why Stage 6 has no photos');
      } else {
        console.log('\n✅ Images extracted successfully — pipeline should have photos');
      }
    }
  } catch (e: any) {
    clearTimeout(timeout);
    console.log('PDF fetch FAILED:', e.message);
  }
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
