// @ts-nocheck
/**
 * MINIMAL Test Processor - Only S3 Upload
 * To isolate whether S3 upload is the issue
 */

import { nanoid } from 'nanoid';
import { storagePut } from './storage';

interface AssessmentResult {
  pdfUrl: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  claimantName?: string;
  damageDescription: string;
  estimatedCost: number;
  damagePhotos: string[];
  accidentType?: string;
  damagedComponents: string[];
  physicsAnalysis: any;
  fraudAnalysis: any;
}

export async function processExternalAssessment(
  fileName: string,
  fileData: string // base64
): Promise<AssessmentResult> {
  console.log('🧪 MINIMAL TEST: Starting...');
  
  try {
    // Convert base64 to buffer
    console.log('📦 Converting base64 to buffer...');
    const fileBuffer = Buffer.from(fileData, "base64");
    console.log(`✅ Buffer created: ${fileBuffer.length} bytes`);

    // Upload PDF to S3
    console.log('📤 Uploading to S3...');
    const { url: pdfUrl } = await storagePut(
      `external-assessments/${nanoid()}-${fileName}`,
      fileBuffer,
      "application/pdf"
    );
    console.log(`✅ S3 upload successful: ${pdfUrl}`);

    // Return mock data
    console.log('✅ MINIMAL TEST: Complete!');
    return {
      pdfUrl,
      vehicleMake: "TEST",
      vehicleModel: "MINIMAL",
      vehicleYear: 2024,
      vehicleRegistration: "TEST123",
      claimantName: "Test Upload",
      damageDescription: "Minimal test - S3 upload only",
      estimatedCost: 1000,
      damagePhotos: [],
      accidentType: "test",
      damagedComponents: ["test"],
      physicsAnalysis: { test: true },
      fraudAnalysis: { test: true },
    };
  } catch (error: any) {
    console.error('❌ MINIMAL TEST FAILED:', error);
    console.error('Error stack:', error.stack);
    throw error;
  }
}
