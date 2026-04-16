'use strict';
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL });
  
  // Get the BMW claim ID
  const [claims] = await conn.execute(
    'SELECT id, claim_number FROM claims WHERE vehicle_registration = ? ORDER BY id DESC LIMIT 1',
    ['ADP6423']
  );
  if (claims.length === 0) { console.log('No claim found'); await conn.end(); return; }
  const claimId = claims[0].id;
  console.log('Triggering final re-run for claim:', claims[0].claim_number, '(ID:', claimId + ')');
  
  // Reset the assessment status to trigger a new run
  await conn.execute(
    'UPDATE claims SET ai_assessment_completed = 0, document_processing_status = "pending" WHERE id = ?',
    [claimId]
  );
  
  console.log('Claim reset to pending — pipeline will pick it up automatically');
  console.log('Or call the triggerAiAssessment endpoint directly...');
  
  await conn.end();
  
  // Now call the assessment endpoint directly
  const http = require('http');
  const postData = JSON.stringify({ claimId });
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/trpc/claims.triggerAiAssessment',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Response status:', res.statusCode);
      try {
        const parsed = JSON.parse(data);
        console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 500));
      } catch (e) {
        console.log('Raw response:', data.substring(0, 500));
      }
    });
  });
  
  req.on('error', (e) => console.error('Request error:', e.message));
  req.write(postData);
  req.end();
}

main().catch(e => console.error('Error:', e.message));
