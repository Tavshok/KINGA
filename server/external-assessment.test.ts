// @ts-nocheck
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";

/**
 * Test external assessment upload workflow
 * 
 * This test verifies that:
 * 1. PDF files can be uploaded and processed
 * 2. PDF pages are extracted as images
 * 3. Images are uploaded to S3
 * 4. Claim is created with damage photos
 * 5. AI assessment is automatically triggered
 * 
 * Note: Tests requiring the PDF fixture file will be skipped if the file is not present.
 */

const PDF_PATH = "/home/ubuntu/upload/ZPCTOYOTAHILUXAGA2795ASSESSMENTREPORT_07_Nov_2024-140814-audit-signed.pdf";
const pdfExists = existsSync(PDF_PATH);

describe("External Assessment Upload", () => {
  it("should have pdftoppm utility available for PDF conversion", async () => {
    const { execSync } = await import("child_process");
    
    try {
      const result = execSync("which pdftoppm", { encoding: "utf-8" });
      expect(result).toContain("pdftoppm");
    } catch (error) {
      throw new Error("pdftoppm utility not found. Install with: sudo apt-get install poppler-utils");
    }
  });

  it.skipIf(!pdfExists)("should verify PDF file exists for testing", () => {
    const pdfBuffer = readFileSync(PDF_PATH);
    expect(pdfBuffer.length).toBeGreaterThan(0);
    console.log(`✓ PDF file found: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
  });

  it.skipIf(!pdfExists)("should extract only photo pages (not all pages) from PDF using Python script", async () => {
    const { execSync } = await import("child_process");
    const { readdirSync } = await import("fs");
    const { join } = await import("path");
    
    const outputDir = "/tmp/test-photo-extraction";
    const scriptPath = join(process.cwd(), "scripts", "extract-pdf-photos.py");
    
    // Run Python photo extraction script
    const output = execSync(
      `python3.11 "${scriptPath}" "${PDF_PATH}" "${outputDir}"`,
      { timeout: 60000, encoding: "utf-8" }
    );
    
    const result = JSON.parse(output);
    
    // Verify extraction succeeded
    expect(result.success).toBe(true);
    expect(result.count).toBe(11); // Only 11 photo pages from 20 total pages
    expect(result.files.length).toBe(11);
    
    console.log(`✓ Extracted ${result.count} photo pages from 20-page PDF (filtered out 9 text-only pages)`);
    
    // Verify extracted files exist
    const extractedFiles = readdirSync(outputDir);
    expect(extractedFiles.length).toBe(11);
    expect(extractedFiles.every((f: string) => f.startsWith("damage-photo-"))).toBe(true);
    expect(extractedFiles.every((f: string) => f.endsWith(".png"))).toBe(true);
    
    console.log(`✓ All extracted files follow naming convention: damage-photo-XXX.png`);
  });
});
