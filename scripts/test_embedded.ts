import { extractEmbeddedImages } from "../server/pipeline-v2/pdfEmbeddedImages";
import * as fs from "fs";

const pdfBuffer = fs.readFileSync("/tmp/test_voltron.pdf");
extractEmbeddedImages(pdfBuffer, 9999999, (msg) => console.log("[Test]", msg))
  .then(result => {
    console.log(`\nResult: ${result.images.length} images uploaded, ${result.skipped} skipped, ${result.errors.length} errors`);
    result.images.slice(0, 8).forEach(img => {
      console.log(`  Page ${img.page}: ${img.width}x${img.height}, ${Math.round(img.fileSizeBytes/1024)}KB → ${img.url}`);
    });
    process.exit(0);
  })
  .catch(err => { console.error("ERROR:", err); process.exit(1); });
