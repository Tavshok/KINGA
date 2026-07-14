/**
 * Upload a corrupt PDF file to S3 for DRA failure path testing.
 * Returns the public S3 URL that can be used as pdfDocumentUrl in the test claim.
 */
import { storagePut } from './storage';

async function main() {
  // Create a file that has a PDF header but corrupt/truncated body
  // pdftoppm will download it successfully but fail to render any pages
  const corruptPdfBytes = Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n' +
    'CORRUPT_TRUNCATED_CONTENT_FOR_DRA_TEST\n' +
    '%%EOF\n'
  );

  console.log('Uploading corrupt PDF to S3...');
  const { url } = await storagePut(
    `test/dra-corrupt-pdf-${Date.now()}.pdf`,
    corruptPdfBytes,
    'application/pdf'
  );
  console.log(`Uploaded: ${url}`);
  console.log(`\nUse this URL as pdfDocumentUrl in the test claim:`);
  console.log(url);
  process.exit(0);
}

main().catch(err => {
  console.error('Upload error:', err);
  process.exit(1);
});
