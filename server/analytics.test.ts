// @ts-nocheck
/**
 * Analytics Endpoints Test Suite
 *
 * Tests for analytics dashboard tRPC endpoints.
 * Note: getClaimsByComplexity, getSLACompliance, getFraudMetrics, getCostSavings
 * are not yet implemented in the analytics router.
 */
import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';

// Mock context - must use a role allowed by analyticsRoleProcedure
// Note: tenantId is required after Batch 2 fail-closed fix — null tenantId now throws FORBIDDEN
const createMockContext = (userId?: number, insurerRole = 'claims_manager', tenantId = 'test-tenant-001'): Context => ({
  user: userId ? {
    id: userId,
    openId: 'test-openid',
    name: 'Test User',
    email: 'test@example.com',
    role: 'insurer',
    insurerRole,
    tenantId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } : null,
});

describe('Analytics Endpoints', () => {
  describe('KPI Dashboard', () => {
    it('should return KPI data', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      const result = await caller.analytics.getKPIs({});
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });

    it('should support optional date range input', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      const result = await caller.analytics.getKPIs({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });
      expect(result).toBeDefined();
    });
  });

  // NOTE: getClaimsByComplexity, getSLACompliance, getFraudMetrics, getCostSavings
  // are not yet implemented in the analytics router. Tests pending implementation.

  describe('Authentication', () => {
    it('should require authentication for analytics endpoints', async () => {
      const caller = appRouter.createCaller(createMockContext()); // No user
      await expect(caller.analytics.getKPIs({})).rejects.toThrow();
    });

    it('should require correct role for analytics endpoints', async () => {
      // claims_processor role should be denied
      const caller = appRouter.createCaller(createMockContext(1, 'claims_processor'));
      await expect(caller.analytics.getKPIs({})).rejects.toThrow();
    });
  });

  describe('Fast Track exports', () => {
    it('rejects PDF and CSV exports until a verified tenant-scoped dataset exists', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      const input = { startDate: '2025-01-01', endDate: '2025-01-31' };
      await expect(caller.analytics.exportFastTrackPDF(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      await expect(caller.analytics.exportFastTrackCSV(input)).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });
  });
});
