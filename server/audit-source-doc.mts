import { createPool } from 'mysql2/promise';

const pool = createPool({
  uri: process.env.DATABASE_URL!,
  connectionLimit: 2,
});

async function main() {
  // Check ingestion_documents for id 4200001
  const [rows] = await pool.execute(
    `SELECT * FROM ingestion_documents WHERE id = 4200001`
  ) as any[];
  
  console.log('=== INGESTION_DOCUMENT 4200001 ===');
  if ((rows as any[]).length === 0) {
    console.log('NOT FOUND in ingestion_documents');
  } else {
    const doc = (rows as any[])[0];
    console.log('id:', doc.id);
    console.log('s3_url:', doc.s3_url);
    console.log('s3_key:', doc.s3_key);
    console.log('original_filename:', doc.original_filename);
    console.log('file_size:', doc.file_size);
    console.log('status:', doc.status);
    console.log('created_at:', doc.created_at);
  }

  // Also check what table source_document_id actually references
  const [allTables] = await pool.execute(`SHOW TABLES`) as any[];
  const tableNames = (allTables as any[]).map((t: any) => Object.values(t)[0] as string);
  
  // Check for any table that might have id=4200001 and a PDF URL
  const candidateTables = tableNames.filter((t: string) => 
    t.includes('document') || t.includes('upload') || t.includes('file') || t.includes('ingestion')
  );
  console.log('\n=== CANDIDATE TABLES ===');
  console.log(candidateTables);

  for (const table of candidateTables.slice(0, 8)) {
    try {
      const [r] = await pool.execute(`SELECT * FROM \`${table}\` WHERE id = 4200001 LIMIT 1`) as any[];
      if ((r as any[]).length > 0) {
        console.log(`\n=== FOUND IN ${table} ===`);
        console.log(JSON.stringify((r as any[])[0], null, 2));
      }
    } catch {}
  }

  await pool.end();
}

main().catch(console.error);
