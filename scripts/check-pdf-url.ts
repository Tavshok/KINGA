import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const claimNumbers = ['DOC-20260420-96C66FBD', 'DOC-20260420-C9031525'];
  
  for (const claimNum of claimNumbers) {
    console.log('\n=== Claim:', claimNum, '===');
    
    // Get claim ID
    const [claimRows] = await conn.execute(
      'SELECT id FROM claims WHERE claim_number = ? LIMIT 1',
      [claimNum]
    ) as any[];
    
    if (!claimRows.length) { console.log('NOT FOUND'); continue; }
    const claimId = claimRows[0].id;
    
    // Check ingestion_documents for this claim
    const [docRows] = await conn.execute(
      `SELECT id, claim_id, s3_url, extraction_status, document_category, file_name, created_at
       FROM ingestion_documents WHERE claim_id = ? ORDER BY created_at DESC LIMIT 5`,
      [claimId]
    ) as any[];
    
    console.log('Ingestion documents:', docRows.length);
    for (const d of docRows) {
      console.log(' -', d.id, 'category:', d.document_category, 'status:', d.extraction_status);
      console.log('   s3_url:', d.s3_url ? d.s3_url.substring(0, 100) : 'NULL');
      console.log('   file_name:', d.file_name);
    }
    
    // Also check claim_documents
    const [cdRows] = await conn.execute(
      `SELECT id, claim_id, document_category, file_url, created_at
       FROM claim_documents WHERE claim_id = ? ORDER BY created_at DESC LIMIT 5`,
      [claimId]
    ) as any[];
    
    console.log('Claim documents:', cdRows.length);
    for (const d of cdRows) {
      console.log(' -', d.id, 'category:', d.document_category);
      console.log('   file_url:', d.file_url ? d.file_url.substring(0, 100) : 'NULL');
    }
  }
  
  await conn.end();
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
