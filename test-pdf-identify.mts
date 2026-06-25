/**
 * Test Pass 1: Send the full Voltron PDF to the LLM and ask it to identify
 * which pages contain actual vehicle damage photographs.
 */
import { createConnection } from "mysql2/promise";
import { invokeLLM } from "./server/_core/llm.js";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  console.log("=== Pass 1: PDF Damage Page Identification Test ===\n");

  // Get the Voltron PDF s3_key and build presigned URL
  const conn = await createConnection(process.env.DATABASE_URL!);
  const [rows]: any = await conn.execute(
    `SELECT sd.s3_key FROM claims c 
     JOIN ingestion_documents sd ON sd.id = c.source_document_id
     WHERE c.id = 8310001 LIMIT 1`
  );
  await conn.end();

  const s3Key = rows[0].s3_key;
  console.log(`PDF key: ${s3Key}\n`);

  // Get presigned URL
  const { storageGet } = await import("./server/storage.js");
  const { url: pdfUrl } = await storageGet(s3Key, 3600);
  console.log(`Presigned URL obtained (length=${pdfUrl.length})\n`);

  // Send full PDF to LLM for damage page identification
  console.log("Sending PDF to LLM for damage page identification...\n");
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a vehicle insurance claim analyst. Your task is to scan a claim form PDF and identify which pages contain actual photographs of vehicle damage.

WHAT TO LOOK FOR (damage photo pages):
- Photographs showing physical damage to a vehicle (dents, scratches, broken glass, crumpled metal, etc.)
- Photos of vehicle exterior or interior with visible damage
- Close-up shots of damaged components
- Overview shots of a damaged vehicle

WHAT TO IGNORE (not damage photo pages):
- Form fields, checkboxes, text blocks
- Signatures, stamps, letterheads
- Diagrams or line drawings
- Tables of repair costs or estimates
- Police report text
- Pages with only text and no photographs

Return a JSON object with this exact structure:
{
  "damage_photo_pages": [list of page numbers that contain actual damage photographs],
  "total_pages_scanned": number,
  "notes": "brief explanation of what you found"
}`
      },
      {
        role: "user",
        content: [
          {
            type: "file_url",
            file_url: { url: pdfUrl, mime_type: "application/pdf" }
          },
          {
            type: "text",
            text: "Please scan this vehicle insurance claim PDF and identify which page numbers contain actual photographs of vehicle damage. Return the result as JSON."
          }
        ]
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "damage_page_identification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            damage_photo_pages: {
              type: "array",
              items: { type: "integer" },
              description: "Page numbers (1-indexed) that contain actual vehicle damage photographs"
            },
            total_pages_scanned: {
              type: "integer",
              description: "Total number of pages in the document"
            },
            notes: {
              type: "string",
              description: "Brief explanation of findings"
            }
          },
          required: ["damage_photo_pages", "total_pages_scanned", "notes"],
          additionalProperties: false
        }
      }
    }
  });

  const content = response.choices?.[0]?.message?.content;
  console.log("Raw LLM response:");
  console.log(content);

  try {
    const parsed = JSON.parse(content ?? "{}");
    console.log("\n=== PARSED RESULT ===");
    console.log(`Total pages scanned: ${parsed.total_pages_scanned}`);
    console.log(`Damage photo pages: [${parsed.damage_photo_pages?.join(", ")}]`);
    console.log(`Notes: ${parsed.notes}`);
  } catch (e) {
    console.error("Failed to parse JSON response:", e);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
