/**
 * Test Stage 2 extraction with the exact schema and PDF URL used in production.
 */
import { config } from 'dotenv';
config();

const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL || 'https://forge.manus.ai';
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const PDF_URL = 'https://d2xsxph8kpxj0f.cloudfront.net/310419663031527958/YbS42LwGroxbVepAMjk4bS/tenant-1771335377063/ingestion/6a04f84f-30c8-4203-9614-a0abb7eb8800/d314cb4a-ed4b-4ace-8f07-0e2106afd0ef-DIEFTRACK%20MARKETING%20BMW318i%20ADP6423-audit-signed.pdf';

console.log('Testing Stage 2 extraction with exact production schema...');
console.log('PDF URL:', PDF_URL.slice(0, 80) + '...');

const controller = new AbortController();
const timer = setTimeout(() => {
  controller.abort();
  console.log('ABORTED after 90s timeout');
}, 90000);

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
      max_tokens: 8192,
      thinking: { budget_tokens: 0 },
      messages: [
        {
          role: 'system',
          content: 'You are a specialist insurance document OCR and text extraction system. Extract ALL text from the provided PDF and return as JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract ALL text from every page of this insurance claim document. Return as JSON with rawText, tables, ocrConfidence, and fieldConfidence.'
            },
            {
              type: 'file_url',
              file_url: {
                url: PDF_URL,
                mime_type: 'application/pdf'
              }
            }
          ]
        }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'text_extraction_v2',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              rawText: { type: 'string', description: 'Full verbatim extracted text' },
              tables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    headers: { type: 'array', items: { type: 'string' } },
                    rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                    context: { type: 'string' },
                  },
                  required: ['headers', 'rows', 'context'],
                  additionalProperties: false,
                },
              },
              ocrConfidence: { type: 'integer', description: 'Overall OCR quality 0-100' },
              fieldConfidence: {
                type: 'object',
                properties: {
                  claimId: { type: 'integer' },
                  vehicleRegistration: { type: 'integer' },
                  accidentDate: { type: 'integer' },
                  incidentType: { type: 'integer' },
                  estimatedSpeed: { type: 'integer' },
                  policeReportNumber: { type: 'integer' },
                  repairQuoteTotal: { type: 'integer' },
                  agreedCost: { type: 'integer' },
                  damageDescription: { type: 'integer' },
                },
                required: ['claimId', 'vehicleRegistration', 'accidentDate', 'incidentType', 'estimatedSpeed', 'policeReportNumber', 'repairQuoteTotal', 'agreedCost', 'damageDescription'],
                additionalProperties: false,
              },
            },
            required: ['rawText', 'tables', 'ocrConfidence', 'fieldConfidence'],
            additionalProperties: false,
          }
        }
      }
    })
  });

  clearTimeout(timer);
  console.log('HTTP status:', resp.status);
  
  if (!resp.ok) {
    const errText = await resp.text();
    console.log('ERROR response:', errText.slice(0, 500));
    process.exit(1);
  }

  const body = await resp.json();
  const content = body?.choices?.[0]?.message?.content;
  const finishReason = body?.choices?.[0]?.finish_reason;
  
  console.log('Finish reason:', finishReason);
  console.log('Content type:', typeof content);
  console.log('Content length:', content?.length);
  
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      console.log('\n=== EXTRACTION RESULTS ===');
      console.log('rawText length:', parsed.rawText?.length);
      console.log('rawText sample:', parsed.rawText?.slice(0, 300));
      console.log('tables count:', parsed.tables?.length);
      console.log('ocrConfidence:', parsed.ocrConfidence);
      console.log('fieldConfidence:', JSON.stringify(parsed.fieldConfidence));
    } catch (parseErr) {
      console.log('JSON parse error:', parseErr.message);
      console.log('Raw content:', content?.slice(0, 500));
    }
  } else {
    console.log('Content is not a string:', JSON.stringify(content)?.slice(0, 300));
  }
} catch (err) {
  clearTimeout(timer);
  console.log('FETCH ERROR:', err.message);
}
