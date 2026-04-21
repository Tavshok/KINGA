// Test LLM API reachability from dev server
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
const dotenv = require('dotenv');
dotenv.config({ path: '.env' });

const apiUrl = process.env.BUILT_IN_FORGE_API_URL;
const apiKey = process.env.BUILT_IN_FORGE_API_KEY;

console.log('LLM API URL:', apiUrl ? apiUrl.substring(0, 60) + '...' : 'NOT SET');
console.log('API Key set:', !!apiKey);

if (!apiUrl || !apiKey) {
  console.error('Missing env vars — checking process.env directly');
  console.log('All env keys with FORGE:', Object.keys(process.env).filter(k => k.includes('FORGE')));
  process.exit(1);
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
const start = Date.now();

try {
  console.log('Sending test LLM request...');
  const resp = await fetch(`${apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'Say "ok" in one word.' }],
      max_tokens: 10,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  console.log('Response status:', resp.status, 'in', Date.now()-start, 'ms');
  const body = await resp.text();
  console.log('Response body:', body.substring(0, 200));
} catch (e) {
  clearTimeout(timeout);
  console.error('Error after', Date.now()-start, 'ms:', e.name, e.message);
}
