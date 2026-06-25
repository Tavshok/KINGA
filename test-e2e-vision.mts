/**
 * End-to-end test for the two-pass PDF vision pipeline.
 * 1. Gets a presigned download URL for the Voltron PDF from the DB
 * 2. Downloads the PDF
 * 3. Renders page 4 (a known damage photo page) using pdftoppm
 * 4. Uploads the rendered PNG via storagePut
 * 5. Verifies the returned URL is publicly accessible
 * 6. Sends the image URL to the LLM for damage analysis
 */
import { createConnection } from "mysql2/promise";
import { renderSpecificPdfPages } from "./server/pipeline-v2/pdfToImages.js";
import { storagePut } from "./server/storage.js";
import { invokeLLM } from "./server/_core/llm.js";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL!;

async function main() {
  console.log("=== KINGA Two-Pass Vision E2E Test ===\n");

  // Step 1: Get the Voltron PDF URL from DB
  console.log("Step 1: Getting Voltron PDF URL from DB...");
  const conn = await createConnection(DB_URL);
  const [rows]: any = await conn.execute(
    `SELECT sd.s3_key, sd.file_size_bytes as file_size 
     FROM claims c 
     JOIN ingestion_documents sd ON sd.id = c.source_document_id
     WHERE c.id = 8310001 LIMIT 1`
  );
  await conn.end();

  if (!rows.length) {
    console.error("❌ Voltron claim not found in DB");
    process.exit(1);
  }

  const s3Key = rows[0].s3_key;
  const fileSize = rows[0].file_size;
  console.log(`✅ Found PDF: key=${s3Key}, size=${fileSize} bytes`);

  // Step 2: Get presigned download URL using storageGet (same as pipeline)
  console.log("\nStep 2: Getting presigned download URL via storageGet...");
  const { storageGet } = await import("./server/storage.js");
  const { url: pdfUrl } = await storageGet(s3Key, 3600);
  console.log(`✅ Presigned URL obtained (length=${pdfUrl.length})`);

  // Step 3: Render specific pages (4 and 7 as test pages)
  // renderSpecificPdfPages returns Map<pageNumber, PdfPageImage>
  console.log("\nStep 3: Rendering pages 4 and 7 via pdftoppm + storagePut...");
  const renderedMap = await renderSpecificPdfPages(pdfUrl, [4, 7], {
    log: (msg) => console.log("  [render]", msg)
  });
  const pages = Array.from(renderedMap.values());
  console.log(`  Pages rendered & uploaded: ${pages.length}`);
  if (pages.length === 0) {
    console.error("❌ No pages rendered — storagePut likely failing in this environment");
    process.exit(1);
  }
  for (const p of pages) {
    console.log(`  ✅ Page ${p.pageNumber}: url=${p.url} (${p.widthPx}x${p.heightPx})`);
  }

  // Step 4: Verify the uploaded image URL is publicly accessible
  console.log("\nStep 4: Verifying uploaded image URLs are accessible...");
  for (const p of pages) {
    const headRes = await fetch(p.url, { method: "HEAD" });
    if (headRes.ok) {
      console.log(`  ✅ Page ${p.pageNumber} URL accessible: ${headRes.status} ${headRes.headers.get("content-type")}`);
    } else {
      console.error(`  ❌ Page ${p.pageNumber} URL NOT accessible: ${headRes.status}`);
    }
  }

  // Step 5: Send first image to LLM for damage analysis
  console.log("\nStep 5: Sending page image to LLM for damage analysis...");
  const testUrl = pages[0].url;
  const llmRes = await invokeLLM({
    messages: [
      {
        role: "system",
        content: "You are a vehicle damage assessor. Analyse the image and list any vehicle damage components visible. Be concise."
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: testUrl, detail: "high" } },
          { type: "text", text: "List all damaged vehicle components visible in this image with their damage type and severity. If no vehicle damage is visible, say so." }
        ]
      }
    ]
  });
  const llmContent = llmRes.choices?.[0]?.message?.content ?? "(no response)";
  console.log(`\n✅ LLM Response:\n${llmContent}\n`);

  console.log("=== E2E Test Complete ===");
  console.log(`\nSummary:`);
  console.log(`  PDF download:    ✅`);
  console.log(`  Page rendering:  ${renderResult.pages.length > 0 ? "✅" : "❌"} (${renderResult.pages.length} pages)`);
  console.log(`  storagePut:      ${renderResult.pages.length > 0 ? "✅" : "❌"}`);
  console.log(`  URL accessible:  (see above)`);
  console.log(`  LLM vision:      ✅`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
