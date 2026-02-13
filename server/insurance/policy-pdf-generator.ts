/**
 * Policy PDF Generator Module
 * 
 * Generates professional insurance policy documents in PDF format
 * with KINGA branding, policy details, and terms & conditions.
 */

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

interface PolicyData {
  policyNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleRegistration: string;
  vehicleValue: number;
  productName: string;
  carrierName: string;
  premiumAmount: number;
  premiumFrequency: 'monthly' | 'annual';
  excessAmount?: number;
  coverageStartDate: Date;
  coverageEndDate: Date;
  coverageLimits?: string;
}

/**
 * Generate a professional insurance policy PDF document
 * 
 * @param policyData - Policy information to include in the document
 * @returns Buffer containing the PDF document
 */
export async function generatePolicyPDF(policyData: PolicyData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        }
      });

      // Buffer to store PDF data
      const chunks: Buffer[] = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // HEADER SECTION
      doc.fontSize(24)
         .fillColor('#10b981')
         .text('KINGA', { align: 'center' });
      
      doc.fontSize(12)
         .fillColor('#6b7280')
         .text('AutoVerify AI - Insurance Platform', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(18)
         .fillColor('#1f2937')
         .text('INSURANCE POLICY DOCUMENT', { align: 'center', underline: true });
      
      doc.moveDown(1.5);

      // POLICY NUMBER SECTION
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('Policy Number:', { continued: true })
         .fillColor('#1f2937')
         .font('Helvetica-Bold')
         .text(` ${policyData.policyNumber}`)
         .font('Helvetica');
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .fillColor('#6b7280')
         .text(`Issue Date: ${new Date().toLocaleDateString('en-US', { 
           year: 'numeric', 
           month: 'long', 
           day: 'numeric' 
         })}`);
      
      doc.moveDown(1.5);

      // POLICY HOLDER INFORMATION
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('POLICY HOLDER INFORMATION');
      
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#e5e7eb');
      
      doc.moveDown(0.5);
      
      doc.fontSize(11)
         .fillColor('#1f2937')
         .text(`Name: ${policyData.customerName}`)
         .text(`Phone: ${policyData.customerPhone}`);
      
      if (policyData.customerEmail) {
        doc.text(`Email: ${policyData.customerEmail}`);
      }
      
      doc.moveDown(1.5);

      // VEHICLE INFORMATION
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('INSURED VEHICLE');
      
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#e5e7eb');
      
      doc.moveDown(0.5);
      
      doc.fontSize(11)
         .fillColor('#1f2937')
         .text(`Make: ${policyData.vehicleMake}`)
         .text(`Model: ${policyData.vehicleModel}`)
         .text(`Year: ${policyData.vehicleYear}`)
         .text(`Registration: ${policyData.vehicleRegistration}`)
         .text(`Estimated Value: $${(policyData.vehicleValue / 100).toFixed(2)}`);
      
      doc.moveDown(1.5);

      // COVERAGE DETAILS
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('COVERAGE DETAILS');
      
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#e5e7eb');
      
      doc.moveDown(0.5);
      
      doc.fontSize(11)
         .fillColor('#1f2937')
         .text(`Insurance Carrier: ${policyData.carrierName}`)
         .text(`Product: ${policyData.productName}`)
         .text(`Coverage Type: Comprehensive Motor Insurance`);
      
      doc.moveDown(0.5);
      
      doc.fontSize(11)
         .fillColor('#1f2937')
         .text(`Coverage Period: ${policyData.coverageStartDate.toLocaleDateString('en-US')} to ${policyData.coverageEndDate.toLocaleDateString('en-US')}`);
      
      doc.moveDown(1.5);

      // PREMIUM INFORMATION
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('PREMIUM INFORMATION');
      
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#e5e7eb');
      
      doc.moveDown(0.5);
      
      const monthlyPremium = (policyData.premiumAmount / 100).toFixed(2);
      const annualPremium = ((policyData.premiumAmount / 100) * 12).toFixed(2);
      
      doc.fontSize(11)
         .fillColor('#1f2937')
         .text(`Premium Frequency: ${policyData.premiumFrequency === 'monthly' ? 'Monthly' : 'Annual'}`)
         .text(`Monthly Premium: $${monthlyPremium}`)
         .text(`Annual Premium: $${annualPremium}`);
      
      if (policyData.excessAmount) {
        doc.text(`Excess Amount: $${(policyData.excessAmount / 100).toFixed(2)}`);
      }
      
      doc.moveDown(1.5);

      // COVERAGE LIMITS (if available)
      if (policyData.coverageLimits) {
        doc.fontSize(14)
           .fillColor('#10b981')
           .text('COVERAGE LIMITS');
        
        doc.moveTo(50, doc.y)
           .lineTo(545, doc.y)
           .stroke('#e5e7eb');
        
        doc.moveDown(0.5);
        
        try {
          const limits = JSON.parse(policyData.coverageLimits);
          doc.fontSize(11)
             .fillColor('#1f2937');
          
          Object.entries(limits).forEach(([key, value]) => {
            doc.text(`${key}: ${value}`);
          });
        } catch {
          doc.fontSize(11)
             .fillColor('#1f2937')
             .text(policyData.coverageLimits);
        }
        
        doc.moveDown(1.5);
      }

      // TERMS AND CONDITIONS
      doc.addPage();
      
      doc.fontSize(14)
         .fillColor('#10b981')
         .text('TERMS AND CONDITIONS');
      
      doc.moveTo(50, doc.y)
         .lineTo(545, doc.y)
         .stroke('#e5e7eb');
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('1. GENERAL PROVISIONS', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text('This policy is a contract between the policyholder and the insurance carrier. The policy provides coverage for the insured vehicle subject to the terms, conditions, and exclusions set forth herein.', { align: 'justify' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('2. COVERAGE', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text('This comprehensive motor insurance policy covers loss or damage to the insured vehicle caused by accident, fire, theft, or other perils as specified in the policy schedule. Coverage is subject to the excess amount specified above.', { align: 'justify' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('3. EXCLUSIONS', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text('This policy does not cover: (a) wear and tear, mechanical or electrical breakdown; (b) damage while driving under the influence of alcohol or drugs; (c) use of the vehicle for purposes not authorized by the policy; (d) damage caused by war, nuclear risks, or civil commotion.', { align: 'justify' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('4. CLAIMS PROCEDURE', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text('In the event of loss or damage, the policyholder must notify the insurance carrier immediately and provide all necessary documentation. Claims will be processed through the KINGA platform for efficient assessment and settlement.', { align: 'justify' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('5. PREMIUM PAYMENT', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text(`Premiums are payable ${policyData.premiumFrequency === 'monthly' ? 'monthly' : 'annually'} in advance. Failure to pay premiums when due may result in suspension or cancellation of coverage. Payment can be made via bank transfer, mobile money (EcoCash, OneMoney), or cash at authorized offices.`, { align: 'justify' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(10)
         .fillColor('#1f2937')
         .text('6. CANCELLATION', { underline: true });
      
      doc.fontSize(9)
         .fillColor('#374151')
         .text('Either party may cancel this policy by giving 30 days written notice. Upon cancellation, the policyholder may be entitled to a pro-rata refund of premium for the unexpired period, subject to no claims having been made.', { align: 'justify' });
      
      doc.moveDown(1.5);

      // FOOTER
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text('This is a computer-generated document and does not require a signature.', { align: 'center' });
      
      doc.moveDown(0.5);
      
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text('For inquiries, contact: support@kinga.co.zw | +263 123 456 789', { align: 'center' });
      
      doc.fontSize(8)
         .fillColor('#6b7280')
         .text('KINGA - AutoVerify AI Insurance Platform', { align: 'center' });

      // Finalize the PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
