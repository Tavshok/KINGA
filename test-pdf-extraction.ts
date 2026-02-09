/**
 * Diagnostic Test Script for PDF Extraction
 * Run with: tsx test-pdf-extraction.ts /path/to/pdf
 */

import { readFileSync } from 'fs';
import { processExternalAssessment } from './server/assessment-processor';

async function testPdfExtraction(pdfPath: string) {
  console.log('='.repeat(80));
  console.log('PDF EXTRACTION DIAGNOSTIC TEST');
  console.log('='.repeat(80));
  console.log('PDF Path:', pdfPath);
  console.log('');

  try {
    // Read PDF file
    const pdfBuffer = readFileSync(pdfPath);
    console.log('✅ PDF file loaded:', pdfBuffer.length, 'bytes');
    console.log('');

    // Process assessment
    console.log('Starting assessment processing...');
    console.log('');
    
    const result = await processExternalAssessment('test.pdf', pdfBuffer);
    
    console.log('');
    console.log('='.repeat(80));
    console.log('EXTRACTION RESULTS');
    console.log('='.repeat(80));
    console.log('');
    console.log('Vehicle Make:', result.vehicleMake || 'NOT EXTRACTED');
    console.log('Vehicle Model:', result.vehicleModel || 'NOT EXTRACTED');
    console.log('Vehicle Year:', result.vehicleYear || 'NOT EXTRACTED');
    console.log('Registration:', result.vehicleRegistration || 'NOT EXTRACTED');
    console.log('Claimant:', result.claimantName || 'NOT EXTRACTED');
    console.log('Accident Date:', result.accidentDate || 'NOT EXTRACTED');
    console.log('Accident Type:', result.accidentType || 'NOT EXTRACTED');
    console.log('Estimated Cost:', result.estimatedCost || 'NOT EXTRACTED');
    console.log('Damaged Components:', result.damagedComponents?.length || 0, 'items');
    console.log('Damage Photos:', result.damagePhotos?.length || 0, 'images');
    console.log('');
    console.log('Data Completeness:', result.dataCompleteness + '%');
    console.log('Missing Data:', result.missingData?.join(', ') || 'None');
    console.log('');
    console.log('='.repeat(80));
    console.log('FULL RESULT OBJECT');
    console.log('='.repeat(80));
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('ERROR OCCURRED');
    console.error('='.repeat(80));
    console.error(error);
  }
}

// Get PDF path from command line
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('Usage: tsx test-pdf-extraction.ts /path/to/pdf');
  process.exit(1);
}

testPdfExtraction(pdfPath);
