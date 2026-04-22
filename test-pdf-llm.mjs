/**
 * Test script: verify whether the Forge API supports file_url with application/pdf
 * and whether it can extract text from a real claim PDF.
 */
import { config } from 'dotenv';
config();

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.im';
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const PDF_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/tenant-1771335377063/ingestion/6a04f84f-30c8-4203-9614-a0abb7eb8800/d314cb4a-ed4b-4ace-8f07-0e2106afd0ef-DIEFTRACK%20MARKETING%20BMW318i%20ADP6423-audit-signed.pdf';

async function testFileUrl() {
  console.log('\n=== TEST 1: file_url with application/pdf ===');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${FORGE_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        max_tokens: 512,
        thinking: { budget_tokens: 0 },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'What is the first line of text in this document? Reply in one sentence.' },
            { type: 'file_url', file_url: { url: PDF_URL, mime_type: 'application/pdf' } }
          ]
        }]
      })
    });
    clearTimeout(timer);
    const body = await resp.json();
    if (!resp.ok) {
      console.log('FAILED HTTP', resp.status, JSON.stringify(body).slice(0, 300));
      return false;
    }
    const text = body?.choices?.[0]?.message?.content;
    console.log('SUCCESS - Response:', text?.slice(0, 200));
    return true;
  } catch (err) {
    clearTimeout(timer);
    console.log('ERROR:', err.message);
    return false;
  }
}

async function testImageUrl() {
  console.log('\n=== TEST 2: image_url with PDF page as image (fallback approach) ===');
  // Test with a simple text prompt to verify API connectivity
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const resp = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${FORGE_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        max_tokens: 64,
        thinking: { budget_tokens: 0 },
        messages: [{
          role: 'user',
          content: 'Say "API OK" and nothing else.'
        }]
      })
    });
    clearTimeout(timer);
    const body = await resp.json();
    if (!resp.ok) {
      console.log('FAILED HTTP', resp.status, JSON.stringify(body).slice(0, 200));
      return false;
    }
    const text = body?.choices?.[0]?.message?.content;
    console.log('API connectivity OK - Response:', text?.slice(0, 100));
    return true;
  } catch (err) {
    clearTimeout(timer);
    console.log('ERROR:', err.message);
    return false;
  }
}

async function testPdfAsText() {
  console.log('\n=== TEST 3: Download PDF and extract text via pdf-parse ===');
  try {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const resp = await fetch(PDF_URL);
    if (!resp.ok) {
      console.log('FAILED to download PDF:', resp.status);
      return false;
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    console.log('PDF downloaded, size:', buffer.length, 'bytes');
    const data = await pdfParse(buffer);
    console.log('PDF pages:', data.numpages);
    console.log('Text sample (first 500 chars):', data.text.slice(0, 500));
    return true;
  } catch (err) {
    console.log('ERROR:', err.message);
    return false;
  }
}

console.log('Forge API URL:', FORGE_API_URL);
console.log('API Key present:', !!FORGE_API_KEY);

const r1 = await testFileUrl();
const r2 = await testImageUrl();
const r3 = await testPdfAsText();

console.log('\n=== RESULTS ===');
console.log('file_url PDF support:', r1 ? 'YES' : 'NO');
console.log('API connectivity:', r2 ? 'YES' : 'NO');
console.log('pdf-parse text extraction:', r3 ? 'YES' : 'NO');
