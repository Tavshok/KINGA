import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // Check both claims
  const claimNumbers = ['DOC-20260420-96C66FBD', 'DOC-20260420-C9031525'];
  
  for (const claimNum of claimNumbers) {
    console.log('\n=== Claim:', claimNum, '===');
    const [rows] = await conn.execute(
      `SELECT id, claim_number, workflow_state, document_processing_status, 
       LENGTH(damage_photos) as dpLen, SUBSTRING(damage_photos, 1, 200) as dpSample
       FROM claims WHERE claim_number = ? LIMIT 1`,
      [claimNum]
    ) as any[];
    
    if (rows.length === 0) {
      console.log('NOT FOUND');
      continue;
    }
    
    const row = rows[0];
    console.log('ID:', row.id);
    console.log('Workflow State:', row.workflow_state);
    console.log('Doc Processing:', row.document_processing_status);
    console.log('damagePhotos length:', row.dpLen);
    console.log('damagePhotos sample:', row.dpSample);
    
    // Check latest ai_assessments for this claim
    const [assessRows] = await conn.execute(
      `SELECT id, claim_id, created_at, 
       SUBSTRING(forensic_analysis, 1, 2000) as faSnippet,
       SUBSTRING(damage_photos_json, 1, 500) as dpJson
       FROM ai_assessments 
       WHERE claim_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    ) as any[];
    
    if (assessRows.length > 0) {
      const a = assessRows[0];
      console.log('Latest assessment ID:', a.id, 'created:', a.created_at);
      
      // Parse forensic_analysis to find imageUrls
      if (a.faSnippet) {
        const imageUrlsMatch = a.faSnippet.match(/"imageUrls"\s*:\s*(\[[^\]]*\])/s);
        if (imageUrlsMatch) {
          console.log('imageUrls in forensic_analysis:', imageUrlsMatch[1].substring(0, 300));
        } else {
          console.log('No imageUrls found in forensic_analysis snippet');
          // Look for photo-related keys
          const photoMatch = a.faSnippet.match(/"(photo|image|damage)[^"]*"\s*:\s*[^,}]*/gi);
          if (photoMatch) console.log('Photo-related fields:', photoMatch.slice(0, 5).join(', '));
        }
      }
      
      if (a.dpJson) {
        console.log('damage_photos_json:', a.dpJson.substring(0, 300));
      } else {
        console.log('damage_photos_json: NULL');
      }
    } else {
      console.log('No assessments found');
    }
  }
  
  await conn.end();
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
