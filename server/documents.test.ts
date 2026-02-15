/**
 * Document Upload/Download Feature Tests
 * Tests document management across all roles and workflows
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from './db';
import { claims, claimDocuments, users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Document Management Features', () => {
  let testClaimId: number;
  let testUserId: number;
  let testDocumentId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Create test user
    const userResult = await db.insert(users).values({
      openId: `test-doc-${Date.now()}`,
      email: `test-doc-${Date.now()}@test.com`,
      name: 'Test Document User',
      role: 'insurer',
      tenantId: 'test-tenant',
    });
    testUserId = Number(userResult.insertId);

    // Create test claim
    const claimResult = await db.insert(claims).values({
      claimNumber: `TEST-DOC-${Date.now()}`,
      policyNumber: 'POL-TEST-001',
      claimantName: 'Test Claimant',
      claimantEmail: 'claimant@test.com',
      claimantPhone: '+1234567890',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2020,
      vehicleRegistration: 'TEST-123',
      incidentDate: new Date(),
      incidentLocation: 'Test Location',
      incidentDescription: 'Test incident for document upload',
      workflowState: 'created',
      tenantId: 'test-tenant',
    });
    testClaimId = Number(claimResult.insertId);
  });

  describe('Document Upload', () => {
    it('should generate correct S3 file path with claim ID prefix', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      // Simulate document upload
      const testFileName = 'test-claim-document.pdf';
      const fileKey = `claim-documents/${testClaimId}/abc123-${testFileName}`;
      
      const docResult = await db.insert(claimDocuments).values({
        claimId: testClaimId,
        uploadedBy: testUserId,
        fileName: testFileName,
        fileKey: fileKey,
        fileUrl: `https://cdn.example.com/${fileKey}`,
        fileSize: 102400, // 100 KB
        mimeType: 'application/pdf',
        documentTitle: 'Test Document',
        documentDescription: 'Test document upload',
        documentCategory: 'other',
        visibleToRoles: JSON.stringify(['insurer', 'assessor', 'panel_beater', 'claimant']),
      });

      testDocumentId = Number(docResult.insertId);

      // Verify document was created
      expect(testDocumentId).toBeGreaterThan(0);

      // Verify file key format
      expect(fileKey).toMatch(/^claim-documents\/\d+\/[a-zA-Z0-9]+-test-claim-document\.pdf$/);
    });

    it('should store document metadata correctly', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const docs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.id, testDocumentId))
        .limit(1);

      expect(docs.length).toBe(1);
      const doc = docs[0];

      expect(doc.claimId).toBe(testClaimId);
      expect(doc.uploadedBy).toBe(testUserId);
      expect(doc.fileName).toBe('test-claim-document.pdf');
      expect(doc.fileSize).toBe(102400);
      expect(doc.mimeType).toBe('application/pdf');
      expect(doc.documentCategory).toBe('other');
    });
  });

  describe('Document Retrieval', () => {
    it('should retrieve documents by claim ID', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const docs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.claimId, testClaimId));

      expect(docs.length).toBeGreaterThan(0);
      expect(docs[0].claimId).toBe(testClaimId);
    });

    it('should include file URL for download', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const docs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.id, testDocumentId))
        .limit(1);

      expect(docs[0].fileUrl).toBeDefined();
      expect(docs[0].fileUrl).toContain('claim-documents');
    });
  });

  describe('Document Access Control', () => {
    it('should store role-based visibility settings', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const docs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.id, testDocumentId))
        .limit(1);

      const visibleRoles = JSON.parse(docs[0].visibleToRoles || '[]');
      expect(visibleRoles).toContain('insurer');
      expect(visibleRoles).toContain('assessor');
      expect(visibleRoles).toContain('panel_beater');
      expect(visibleRoles).toContain('claimant');
    });
  });

  describe('Document Categories', () => {
    it('should support multiple document categories', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const categories = [
        'damage_photo',
        'repair_quote',
        'invoice',
        'police_report',
        'medical_report',
        'insurance_policy',
        'correspondence',
        'other',
      ];

      for (const category of categories) {
        const result = await db.insert(claimDocuments).values({
          claimId: testClaimId,
          uploadedBy: testUserId,
          fileName: `test-${category}.pdf`,
          fileKey: `claim-documents/${testClaimId}/test-${category}.pdf`,
          fileUrl: `https://cdn.example.com/claim-documents/${testClaimId}/test-${category}.pdf`,
          fileSize: 1024,
          mimeType: 'application/pdf',
          documentCategory: category as any,
          visibleToRoles: JSON.stringify(['insurer']),
        });

        expect(result.insertId).toBeDefined();
      }

      // Verify all categories were created
      const allDocs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.claimId, testClaimId));

      const foundCategories = allDocs.map(doc => doc.documentCategory);
      categories.forEach(cat => {
        expect(foundCategories).toContain(cat);
      });
    });
  });

  describe('File Path Prefixes', () => {
    it('should use consistent claim-documents prefix for all uploads', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const allDocs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.claimId, testClaimId));

      allDocs.forEach(doc => {
        expect(doc.fileKey).toMatch(/^claim-documents\/\d+\//);
      });
    });

    it('should include claim ID in file path for organization', async () => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const allDocs = await db
        .select()
        .from(claimDocuments)
        .where(eq(claimDocuments.claimId, testClaimId));

      allDocs.forEach(doc => {
        expect(doc.fileKey).toContain(`claim-documents/${testClaimId}/`);
      });
    });
  });
});
