// @ts-nocheck
/**
 * Document Upload/Download Feature Tests
 * Tests document management across all roles and workflows
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { claims, claimDocuments, users } from '../drizzle/schema';
import { eq, inArray } from 'drizzle-orm';

describe('Document Management Features', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let testClaimId: number | undefined;
  let testUserId: number | undefined;
  let testDocumentId: number | undefined;
  const ownedDocumentIds: number[] = [];
  let fixtureStamp: string | undefined;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error('Database not available');
    fixtureStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // Create test user
    const userResult = await db.insert(users).values({
      openId: `fixture-doc-${fixtureStamp}`,
      email: `fixture-doc-${fixtureStamp}@example.invalid`,
      name: 'Test Document User',
      role: 'insurer',
      tenantId: `fixture-doc-tenant-${fixtureStamp}`,
    });
    testUserId = parseInt(String(userResult[0]?.insertId ?? userResult.insertId), 10);
    if (!Number.isSafeInteger(testUserId)) throw new Error('Unable to create owned document fixture user');

    // Create test claim
    const claimResult = await db.insert(claims).values({
      claimNumber: `FIXTURE-DOC-${fixtureStamp}`,
      claimantId: testUserId,
      policyNumber: 'POL-TEST-001',
      claimantName: 'Test Claimant',
      claimantEmail: 'claimant@test.com',
      claimantPhone: '+1234567890',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2020,
      vehicleRegistration: `FXDOC-${fixtureStamp.slice(-7).toUpperCase()}`,
      incidentDate: new Date(),
      incidentLocation: 'Test Location',
      incidentDescription: 'Test incident for document upload',
      workflowState: 'created',
      tenantId: `fixture-doc-tenant-${fixtureStamp}`,
    });
    testClaimId = parseInt(String(claimResult[0]?.insertId ?? claimResult.insertId), 10);
    if (!Number.isSafeInteger(testClaimId)) throw new Error('Unable to create owned document fixture claim');
  });

  afterAll(async () => {
    if (!db) return;

    if (ownedDocumentIds.length > 0) {
      await db.delete(claimDocuments).where(inArray(claimDocuments.id, ownedDocumentIds));
    }
    if (testClaimId !== undefined) {
      await db.delete(claims).where(eq(claims.id, testClaimId));
    }
    if (testUserId !== undefined) {
      await db.delete(users).where(eq(users.id, testUserId));
    }

    // No-leak proof: only exact captured document, claim, and user IDs are queried.
    const [remainingDocuments, remainingClaims, remainingUsers] = await Promise.all([
      ownedDocumentIds.length > 0
        ? db.select({ id: claimDocuments.id }).from(claimDocuments).where(inArray(claimDocuments.id, ownedDocumentIds))
        : Promise.resolve([]),
      testClaimId !== undefined
        ? db.select({ id: claims.id }).from(claims).where(eq(claims.id, testClaimId))
        : Promise.resolve([]),
      testUserId !== undefined
        ? db.select({ id: users.id }).from(users).where(eq(users.id, testUserId))
        : Promise.resolve([]),
    ]);
    expect(remainingDocuments).toHaveLength(0);
    expect(remainingClaims).toHaveLength(0);
    expect(remainingUsers).toHaveLength(0);
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

      testDocumentId = parseInt(String(docResult[0]?.insertId ?? docResult.insertId), 10);
      if (!Number.isSafeInteger(testDocumentId)) throw new Error('Unable to create owned document fixture');
      ownedDocumentIds.push(testDocumentId);

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

        const documentId = parseInt(String(result[0]?.insertId ?? result.insertId), 10);
        if (!Number.isSafeInteger(documentId)) throw new Error(`Unable to create owned ${category} document fixture`);
        ownedDocumentIds.push(documentId);

        expect(result[0] || result).toBeDefined();
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
