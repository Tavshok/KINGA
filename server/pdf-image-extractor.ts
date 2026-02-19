// @ts-nocheck
/**
 * PDF Image Extraction using system-level pdfimages + sharp
 * 
 * Strategy:
 * 1. Write PDF buffer to temp file
 * 2. Use `pdfimages` (from poppler-utils) to extract embedded images
 * 3. Convert extracted images to PNG using sharp
 * 4. Upload to S3 via storagePut
 * 5. Return array of S3 URLs
 * 
 * This approach reliably extracts actual embedded images from PDFs,
 * unlike the previous approach that just stored the PDF URL.
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync, mkdirSync, existsSync, unlinkSync, rmSync } from 'fs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';
import sharp from 'sharp';

interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
}

/**
 * Extract images from a PDF buffer and upload to S3
 * @param pdfBuffer - Buffer containing the PDF file
 * @param pdfFileName - Original filename for logging
 * @returns Array of extracted image objects with S3 URLs
 */
export async function extractImagesFromPDFBuffer(pdfBuffer: Buffer, pdfFileName?: string): Promise<ExtractedImage[]> {
  const sessionId = nanoid(8);
  const tempDir = `/tmp/pdf-extract-${sessionId}`;
  const pdfPath = join(tempDir, 'input.pdf');
  const imagePrefix = join(tempDir, 'img');
  
  console.log(`🖼️ [PDF Image Extractor] Starting extraction from: ${pdfFileName || 'buffer'} (session: ${sessionId})`);
  
  try {
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });
    
    // Write PDF buffer to temp file
    writeFileSync(pdfPath, pdfBuffer);
    console.log(`📄 [PDF Image Extractor] Wrote ${pdfBuffer.length} bytes to temp file`);
    
    // Use pdfimages to extract all images from the PDF
    // -all: extract all images (including inline)
    // -png: output as PNG format
    try {
      execSync(`pdfimages -all "${pdfPath}" "${imagePrefix}"`, {
        timeout: 60000, // 60 second timeout
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (extractError: any) {
      console.warn(`⚠️ [PDF Image Extractor] pdfimages extraction warning: ${extractError.message}`);
      // Try alternative: pdftoppm to render pages as images
      try {
        console.log(`🔄 [PDF Image Extractor] Falling back to pdftoppm page rendering...`);
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${imagePrefix}"`, {
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (fallbackError: any) {
        console.error(`❌ [PDF Image Extractor] Both extraction methods failed: ${fallbackError.message}`);
        return [];
      }
    }
    
    // Find all extracted image files
    const files = readdirSync(tempDir).filter(f => 
      f.startsWith('img') && (
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.ppm') || 
        f.endsWith('.pbm') || f.endsWith('.pgm') || f.endsWith('.tif') ||
        f.endsWith('.tiff') || f.endsWith('.jp2') || f.endsWith('.jb2') ||
        f.endsWith('.ccitt')
      )
    ).sort();
    
    console.log(`📸 [PDF Image Extractor] Found ${files.length} raw image files`);
    
    if (files.length === 0) {
      console.log(`⚠️ [PDF Image Extractor] No images found in PDF, trying pdftoppm fallback...`);
      // Fallback: render each page as an image
      try {
        execSync(`pdftoppm -png -r 200 "${pdfPath}" "${imagePrefix}-page"`, {
          timeout: 120000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        const pageFiles = readdirSync(tempDir).filter(f => 
          f.startsWith('img-page') && f.endsWith('.png')
        ).sort();
        files.push(...pageFiles);
        console.log(`📄 [PDF Image Extractor] Rendered ${pageFiles.length} pages as images`);
      } catch (e) {
        console.error(`❌ [PDF Image Extractor] Page rendering also failed`);
      }
    }
    
    const extractedImages: ExtractedImage[] = [];
    
    // Process each extracted image
    for (const file of files) {
      try {
        const filePath = join(tempDir, file);
        const fileBuffer = readFileSync(filePath);
        
        // Convert to PNG using sharp (handles ppm, pbm, tiff, etc.)
        let pngBuffer: Buffer;
        let metadata: sharp.Metadata;
        
        try {
          const sharpInstance = sharp(fileBuffer);
          metadata = await sharpInstance.metadata();
          
          // Skip very small images (icons, decorative elements, logos, stamps)
          // Damage photos are typically at least 150x150 pixels
          const w = metadata.width || 0;
          const h = metadata.height || 0;
          if (w < 150 || h < 150) {
            console.log(`⏭️ [PDF Image Extractor] Skipping small image: ${file} (${w}x${h})`);
            continue;
          }
          
          // Skip very narrow images (likely borders, lines, or decorative elements)
          const aspectRatio = w / (h || 1);
          if (aspectRatio > 6 || aspectRatio < 0.16) {
            console.log(`⏭️ [PDF Image Extractor] Skipping narrow image: ${file} (${w}x${h})`);
            continue;
          }
          
          // Skip images that are too small in total pixel area (likely logos/icons)
          const totalPixels = w * h;
          if (totalPixels < 40000) { // Less than ~200x200 equivalent
            console.log(`⏭️ [PDF Image Extractor] Skipping low-resolution image: ${file} (${totalPixels} pixels)`);
            continue;
          }
          
          pngBuffer = await sharpInstance.png({ quality: 90 }).toBuffer();
        } catch (sharpError) {
          console.warn(`⚠️ [PDF Image Extractor] Sharp conversion failed for ${file}, skipping`);
          continue;
        }
        
        // Extract page number from filename (pdfimages names like img-000.png, img-001.png)
        const pageMatch = file.match(/(\d+)/);
        const pageNumber = pageMatch ? parseInt(pageMatch[1]) + 1 : 1;
        
        // Upload to S3
        const imageKey = `extracted-images/${sessionId}/${nanoid(10)}.png`;
        const { url } = await storagePut(imageKey, pngBuffer, 'image/png');
        
        extractedImages.push({
          url,
          width: metadata.width || 0,
          height: metadata.height || 0,
          pageNumber
        });
        
        console.log(`📤 [PDF Image Extractor] Uploaded image ${extractedImages.length}: ${metadata.width}x${metadata.height} from page ~${pageNumber} → ${url.substring(0, 80)}...`);
        
      } catch (imgError: any) {
        console.error(`❌ [PDF Image Extractor] Error processing ${file}: ${imgError.message}`);
      }
    }
    
    console.log(`✅ [PDF Image Extractor] Extraction complete. Uploaded ${extractedImages.length} images to S3`);
    return extractedImages;
    
  } catch (error: any) {
    console.error(`❌ [PDF Image Extractor] Fatal error: ${error.message}`);
    return [];
  } finally {
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
      console.log(`🧹 [PDF Image Extractor] Cleaned up temp directory`);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Legacy function signature for backward compatibility
 * @deprecated Use extractImagesFromPDFBuffer instead
 */
export async function extractImagesFromPDF(pdfPath: string): Promise<ExtractedImage[]> {
  try {
    const buffer = readFileSync(pdfPath);
    return extractImagesFromPDFBuffer(buffer, pdfPath);
  } catch (error: any) {
    console.error(`❌ [PDF Image Extractor] Error reading file ${pdfPath}: ${error.message}`);
    return [];
  }
}
