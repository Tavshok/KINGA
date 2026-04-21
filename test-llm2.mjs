// Direct LLM API test using actual env values
const apiUrl = 'https://forge.manus.ai';
const apiKey = '7nfvT3Hv3fzBRUYP5qsR7g';

console.log('Testing LLM API at:', apiUrl);

const controller = new AbortController();
const timeout = setTimeout(() => {
  console.log('Aborting after 30s timeout...');
  controller.abort();
}, 30000);

const start = Date.now();

try {
  console.log('Sending request...');
  const resp = await fetch(`${apiUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'Say "ok".' }],
      max_tokens: 10,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  console.log('Response status:', resp.status, 'in', Date.now()-start, 'ms');
  const body = await resp.text();
  console.log('Response:', body.substring(0, 300));
} catch (e) {
  clearTimeout(timeout);
  console.error('Error after', Date.now()-start, 'ms:', e.name, '-', e.message);
}
