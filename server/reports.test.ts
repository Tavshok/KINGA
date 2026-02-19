/**
 * Reports Router Tests
 * 
 * Tests for PDF report generation endpoints with performance validation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import { getDb } from './db';

describe('Reports Router', () => {
  let db: Awaited<ReturnType<typeof getDb>>;
  let caller: any;

  beforeAll(async () => {
    db = await getDb();
    
    // Create test caller with mock context
    caller = appRouter.createCaller({
      user: {
        id: 'test-user-id',
        tenantId: 'test-tenant-id',
        role: 'insurer_staff',
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  });

  describe('generateExecutiveReport', () => {
    it('should generate executive report with valid structure', async () => {
      const result = await caller.reports.generateExecutiveReport({});

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.pdfBuffer).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.reportType).toBe('executive');
      expect(result.metadata.generatedAt).toBeDefined();
      expect(result.metadata.tenantId).toBe('test-tenant-id');
    });

    it('should complete DB query in < 100ms', async () => {
      const result = await caller.reports.generateExecutiveReport({});

      expect(result.metadata.dbQueryTime).toBeLessThan(100);
      console.log(`Executive Report DB query time: ${result.metadata.dbQueryTime}ms`);
    });

    it('should return base64-encoded PDF buffer', async () => {
      const result = await caller.reports.generateExecutiveReport({});

      // Verify base64 encoding
      expect(result.pdfBuffer).toMatch(/^[A-Za-z0-9+/]+=*$/);
      
      // Verify PDF signature (starts with %PDF)
      const pdfBuffer = Buffer.from(result.pdfBuffer, 'base64');
      expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
    });

    it('should include performance metrics in metadata', async () => {
      const result = await caller.reports.generateExecutiveReport({});

      expect(result.metadata.totalClaims).toBeGreaterThanOrEqual(0);
      expect(result.metadata.dbQueryTime).toBeGreaterThan(0);
      expect(result.metadata.totalGenerationTime).toBeGreaterThan(0);
    });
  });

  describe('generateFinancialSummary', () => {
    it('should generate financial summary with valid structure', async () => {
      const result = await caller.reports.generateFinancialSummary({});

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.pdfBuffer).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.reportType).toBe('financial');
      expect(result.metadata.generatedAt).toBeDefined();
      expect(result.metadata.tenantId).toBe('test-tenant-id');
    });

    it('should complete DB query in < 100ms', async () => {
      const result = await caller.reports.generateFinancialSummary({});

      expect(result.metadata.dbQueryTime).toBeLessThan(100);
      console.log(`Financial Summary DB query time: ${result.metadata.dbQueryTime}ms`);
    });

    it('should return base64-encoded PDF buffer', async () => {
      const result = await caller.reports.generateFinancialSummary({});

      // Verify base64 encoding
      expect(result.pdfBuffer).toMatch(/^[A-Za-z0-9+/]+=*$/);
      
      // Verify PDF signature
      const pdfBuffer = Buffer.from(result.pdfBuffer, 'base64');
      expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
    });

    it('should include financial metrics in metadata', async () => {
      const result = await caller.reports.generateFinancialSummary({});

      expect(result.metadata.totalClaimsValue).toBeGreaterThanOrEqual(0);
      expect(result.metadata.dbQueryTime).toBeGreaterThan(0);
      expect(result.metadata.totalGenerationTime).toBeGreaterThan(0);
    });
  });

  describe('generateAuditTrailReport', () => {
    it('should generate audit trail report with valid structure', async () => {
      const result = await caller.reports.generateAuditTrailReport({});

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.pdfBuffer).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.reportType).toBe('audit_trail');
      expect(result.metadata.generatedAt).toBeDefined();
      expect(result.metadata.tenantId).toBe('test-tenant-id');
    });

    it('should complete DB query in < 100ms', async () => {
      const result = await caller.reports.generateAuditTrailReport({});

      expect(result.metadata.dbQueryTime).toBeLessThan(100);
      console.log(`Audit Trail Report DB query time: ${result.metadata.dbQueryTime}ms`);
    });

    it('should return base64-encoded PDF buffer', async () => {
      const result = await caller.reports.generateAuditTrailReport({});

      // Verify base64 encoding
      expect(result.pdfBuffer).toMatch(/^[A-Za-z0-9+/]+=*$/);
      
      // Verify PDF signature
      const pdfBuffer = Buffer.from(result.pdfBuffer, 'base64');
      expect(pdfBuffer.toString('utf-8', 0, 4)).toBe('%PDF');
    });

    it('should include audit metrics in metadata', async () => {
      const result = await caller.reports.generateAuditTrailReport({});

      expect(result.metadata.totalEvents).toBeGreaterThanOrEqual(0);
      expect(result.metadata.dbQueryTime).toBeGreaterThan(0);
      expect(result.metadata.totalGenerationTime).toBeGreaterThan(0);
    });
  });

  describe('Performance Monitoring', () => {
    it('should log generation time for all reports', async () => {
      const executiveResult = await caller.reports.generateExecutiveReport({});
      const financialResult = await caller.reports.generateFinancialSummary({});
      const auditResult = await caller.reports.generateAuditTrailReport({});

      console.log('\n=== Report Generation Performance ===');
      console.log(`Executive Report: ${executiveResult.metadata.totalGenerationTime}ms (DB: ${executiveResult.metadata.dbQueryTime}ms)`);
      console.log(`Financial Summary: ${financialResult.metadata.totalGenerationTime}ms (DB: ${financialResult.metadata.dbQueryTime}ms)`);
      console.log(`Audit Trail Report: ${auditResult.metadata.totalGenerationTime}ms (DB: ${auditResult.metadata.dbQueryTime}ms)`);
      console.log('=====================================\n');

      // All reports should complete in reasonable time
      expect(executiveResult.metadata.totalGenerationTime).toBeLessThan(5000);
      expect(financialResult.metadata.totalGenerationTime).toBeLessThan(5000);
      expect(auditResult.metadata.totalGenerationTime).toBeLessThan(5000);
    });
  });
});
