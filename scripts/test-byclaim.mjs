import mysql from 'mysql2/promise';
import http from 'http';

const url = process.env.DATABASE_URL;
if (!url) { console.log('No DATABASE_URL'); process.exit(1); }

const conn = await mysql.createConnection(url);
const [sessions] = await conn.execute('SELECT token FROM sessions ORDER BY created_at DESC LIMIT 3');
await conn.end();

if (sessions.length === 0) {
  console.log('No sessions found');
  process.exit(1);
}

const token = sessions[0].token;
console.log('Using session token prefix:', token?.substring(0, 20));

const makeRequest = (path) => new Promise((resolve, reject) => {
  const opts = {
    hostname: 'localhost', port: 3000,
    path,
    headers: { Cookie: `kinga_session=${token}` }
  };
  http.get(opts, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({ raw: data.substring(0, 200) }); }
    });
  }).on('error', reject);
});

// Test byClaim
const byClaimPath = '/api/trpc/aiAssessments.byClaim?input=' + encodeURIComponent(JSON.stringify({json:{claimId:4500001}}));
const byClaimResult = await makeRequest(byClaimPath);
const byClaimData = byClaimResult?.result?.data?.json;
console.log('\n=== byClaim ===');
console.log('null?', byClaimData === null, 'type:', typeof byClaimData, 'has data?', !!byClaimData);
if (byClaimData) console.log('keys:', Object.keys(byClaimData).slice(0, 10).join(', '));
if (byClaimResult?.error) console.log('ERROR:', JSON.stringify(byClaimResult.error).substring(0, 300));

// Test getEnforcement
const enfPath = '/api/trpc/aiAssessments.getEnforcement?input=' + encodeURIComponent(JSON.stringify({json:{claimId:4500001}}));
const enfResult = await makeRequest(enfPath);
const enfData = enfResult?.result?.data?.json;
console.log('\n=== getEnforcement ===');
console.log('null?', enfData === null, 'type:', typeof enfData, 'has data?', !!enfData);
if (enfData) console.log('keys:', Object.keys(enfData).slice(0, 10).join(', '));
if (enfResult?.error) console.log('ERROR:', JSON.stringify(enfResult.error).substring(0, 300));
