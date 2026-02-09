/**
 * PDF Image Extraction using pdfjs-dist (Node.js)
 * Replaces Python-based image extraction to avoid SRE module mismatch errors
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { nanoid } from 'nanoid';
import { storagePut } from './storage';

// Disable worker for Node.js environment
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

interface ExtractedImage {
  url: string;
  width: number;
  height: number;
  pageNumber: number;
}

/**
 * Extract images from PDF and upload to S3
 * @param pdfPath - Path to the PDF file
 * @returns Array of uploaded image URLs
 */
export async function extractImagesFromPDF(pdfPath: string): Promise<ExtractedImage[]> {
  console.log(`🖼️ [PDF Image Extractor] Starting extraction from: ${pdfPath}`);
  
  try {
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    
    console.log(`📄 [PDF Image Extractor] PDF has ${numPages} pages`);
    
    const extractedImages: ExtractedImage[] = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const operatorList = await page.getOperatorList();
      
      // Find image operators
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        
        // Check if this is an image operation (paintImageXObject or paintInlineImageXObject)
        if (fn === pdfjsLib.OPS.paintImageXObject || fn === pdfjsLib.OPS.paintInlineImageXObject) {
          try {
            const args = operatorList.argsArray[i];
            const imageName = args[0];
            
            // Get the image object
            const image = await page.objs.get(imageName);
            
            if (image && image.width && image.height && image.data) {
              // Filter out very small images (likely icons or decorative elements)
              if (image.width < 100 || image.height < 100) {
                console.log(`⏭️ [PDF Image Extractor] Skipping small image (${image.width}x${image.height}) on page ${pageNum}`);
                continue;
              }
              
              console.log(`✅ [PDF Image Extractor] Found image on page ${pageNum}: ${image.width}x${image.height}`);
              
              // Convert image data to PNG buffer
              const canvas = createCanvas(image.width, image.height, image.data);
              const pngBuffer = canvas.toBuffer('image/png');
              
              // Upload to S3
              const imageKey = `extracted-images/${nanoid()}.png`;
              const { url } = await storagePut(imageKey, pngBuffer, 'image/png');
              
              extractedImages.push({
                url,
                width: image.width,
                height: image.height,
                pageNumber: pageNum
              });
              
              console.log(`📤 [PDF Image Extractor] Uploaded image ${extractedImages.length}: ${url}`);
            }
          } catch (imgError) {
            console.error(`❌ [PDF Image Extractor] Error processing image on page ${pageNum}:`, imgError);
          }
        }
      }
    }
    
    console.log(`✅ [PDF Image Extractor] Extraction complete. Found ${extractedImages.length} images`);
    return extractedImages;
    
  } catch (error) {
    console.error(`❌ [PDF Image Extractor] Fatal error:`, error);
    return []; // Return empty array instead of throwing to allow processing to continue
  }
}

/**
 * Create a canvas from image data and convert to PNG buffer
 * Uses node-canvas for server-side canvas operations
 */
function createCanvas(width: number, height: number, imageData: Uint8ClampedArray): any {
  // We'll use a simpler approach: convert raw RGBA data to PNG using sharp
  // This avoids the complexity of node-canvas
  const sharp = require('sharp');
  
  return {
    toBuffer: (format: string) => {
      // Convert RGBA data to PNG using sharp
      return sharp(Buffer.from(imageData), {
        raw: {
          width,
          height,
          channels: 4 // RGBA
        }
      })
      .png()
      .toBuffer();
    }
  };
}
