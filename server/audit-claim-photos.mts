import { createPool } from 'mysql2/promise';

const pool = createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 2,
});

async function main() {
  // Get all photo-related columns for claim 9330001
  const [rows] = await pool.execute(
    `SELECT 
      id,
      claim_reference,
      damage_photos,
      source_document_id,
      external_assessment_url,
      status,
      created_at
     FROM claims WHERE id = 9330001`
  ) as any[];
  
  const claim = (rows as any[])[0];
  console.log('=== CLAIM PHOTO COLUMNS ===');
  console.log('damage_photos:', claim.damage_photos);
  console.log('source_document_id:', claim.source_document_id);
  console.log('external_assessment_url:', claim.external_assessment_url);
  console.log('status:', claim.status);

  // Check claim_documents for this claim
  const [docRows] = await pool.execute(
    `SELECT id, document_category, document_url, file_url, created_at 
     FROM claim_documents WHERE claim_id = 9330001`
  ) as any[];
  console.log(`\n=== CLAIM_DOCUMENTS (${(docRows as any[]).length} rows) ===`);
  (docRows as any[]).forEach((d: any) => console.log(`  id=${d.id} category=${d.document_category} url=${d.document_url || d.file_url}`));

  // Check if there's a claim_photos table
  const [tableRows] = await pool.execute(
    `SHOW TABLES LIKE '%photo%'`
  ) as any[];
  console.log('\n=== TABLES WITH "photo" ===');
  (tableRows as any[]).forEach((t: any) => console.log(' ', Object.values(t)[0]));

  // Check claim_uploads or similar
  const [uploadTables] = await pool.execute(
    `SHOW TABLES LIKE '%upload%'`
  ) as any[];
  console.log('\n=== TABLES WITH "upload" ===');
  (uploadTables as any[]).forEach((t: any) => console.log(' ', Object.values(t)[0]));

  // Check claim_files or similar
  const [fileTables] = await pool.execute(
    `SHOW TABLES LIKE '%file%'`
  ) as any[];
  console.log('\n=== TABLES WITH "file" ===');
  (fileTables as any[]).forEach((t: any) => console.log(' ', Object.values(t)[0]));

  // Check the ai_assessments for this claim — specifically damage_photos_json
  const [assessRows] = await pool.execute(
    `SELECT id, damage_photos_json, created_at FROM ai_assessments 
     WHERE claim_id = 9330001 ORDER BY created_at DESC LIMIT 3`
  ) as any[];
  console.log(`\n=== AI_ASSESSMENTS damage_photos_json (${(assessRows as any[]).length} rows) ===`);
  (assessRows as any[]).forEach((a: any) => {
    let photos: any[] = [];
    try { photos = JSON.parse(a.damage_photos_json || '[]'); } catch {}
    console.log(`  id=${a.id} photos=${photos.length} created=${a.created_at}`);
    if (photos.length > 0) console.log('  first photo:', photos[0]);
  });

  await pool.end();
}

main().catch(console.error);
