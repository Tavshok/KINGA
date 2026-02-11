/**
 * Analytics Endpoints Test Suite
 * 
 * Tests for analytics dashboard tRPC endpoints:
 * - Claims Cost Trend Analytics
 * - Fraud Heatmap Visualization
 * - Fleet Risk Monitoring
 * - Panel Beater Performance
 */

import { describe, it, expect } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';

// Mock context for testing
const createMockContext = (userId?: number): Context => ({
  user: userId ? {
    id: userId,
    openId: 'test-openid',
    name: 'Test User',
    email: 'test@example.com',
    role: 'insurer',
    createdAt: new Date(),
    updatedAt: new Date(),
  } : null,
});

describe('Analytics Endpoints', () => {
  describe('Claims Cost Trend Analytics', () => {
    it('should return claims cost trend data with summary', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.claimsCostTrend({
        startDate: '2025-01-01',
        endDate: '2026-02-11',
        groupBy: 'month',
      });

      // Verify structure
      expect(result).toHaveProperty('trendData');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.trendData)).toBe(true);

      // Verify summary fields
      expect(result.summary).toHaveProperty('totalClaims');
      expect(result.summary).toHaveProperty('totalCost');
      expect(result.summary).toHaveProperty('avgCost');
      expect(result.summary).toHaveProperty('approvalRate');
      
      // Verify data types
      expect(typeof result.summary.totalClaims).toBe('number');
      expect(typeof result.summary.totalCost).toBe('number');
      expect(typeof result.summary.avgCost).toBe('number');

      // Verify trend data structure if available
      if (result.trendData.length > 0) {
        const firstTrend = result.trendData[0];
        expect(firstTrend).toHaveProperty('period');
        expect(firstTrend).toHaveProperty('claimCount');
        expect(firstTrend).toHaveProperty('totalCost');
        expect(firstTrend).toHaveProperty('avgCost');
      }
    });

    it('should support different groupBy intervals', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const intervals: Array<'day' | 'week' | 'month' | 'quarter' | 'year'> = ['day', 'week', 'month', 'quarter', 'year'];
      
      for (const interval of intervals) {
        const result = await caller.analytics.claimsCostTrend({
          startDate: '2025-01-01',
          endDate: '2026-02-11',
          groupBy: interval,
        });

        expect(result).toHaveProperty('trendData');
        expect(Array.isArray(result.trendData)).toBe(true);
      }
    });
  });

  describe('Cost Breakdown Analytics', () => {
    it('should return cost breakdown by vehicle make', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.costBreakdown({
        startDate: '2025-01-01',
        endDate: '2026-02-11',
        breakdownBy: 'vehicle_make',
      });

      expect(Array.isArray(result)).toBe(true);

      // Verify breakdown data structure if available
      if (result.length > 0) {
        const firstBreakdown = result[0];
        expect(firstBreakdown).toHaveProperty('category');
        expect(firstBreakdown).toHaveProperty('claimCount');
        expect(firstBreakdown).toHaveProperty('totalCost');
        expect(firstBreakdown).toHaveProperty('avgCost');
        
        expect(typeof firstBreakdown.claimCount).toBe('number');
        expect(typeof firstBreakdown.totalCost).toBe('number');
        expect(typeof firstBreakdown.avgCost).toBe('number');
      }
    });

    it('should support different breakdown dimensions', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const dimensions: Array<'claim_type' | 'vehicle_make' | 'damage_severity'> = [
        'claim_type',
        'vehicle_make',
        'damage_severity'
      ];
      
      for (const dimension of dimensions) {
        const result = await caller.analytics.costBreakdown({
          startDate: '2025-01-01',
          endDate: '2026-02-11',
          breakdownBy: dimension,
        });

        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('Fraud Heatmap Analytics', () => {
    it('should return fraud heatmap data', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.fraudHeatmap();

      expect(Array.isArray(result)).toBe(true);

      // Verify heatmap data structure if available
      if (result.length > 0) {
        const firstLocation = result[0];
        expect(firstLocation).toHaveProperty('location');
        expect(firstLocation).toHaveProperty('city');
        expect(firstLocation).toHaveProperty('fraudCount');
        expect(firstLocation).toHaveProperty('avgFraudScore');
        expect(firstLocation).toHaveProperty('totalAmount');
        expect(firstLocation).toHaveProperty('lat');
        expect(firstLocation).toHaveProperty('lng');
        
        expect(typeof firstLocation.fraudCount).toBe('number');
        expect(typeof firstLocation.avgFraudScore).toBe('number');
        expect(typeof firstLocation.totalAmount).toBe('number');
        expect(typeof firstLocation.lat).toBe('number');
        expect(typeof firstLocation.lng).toBe('number');
      }
    });
  });

  describe('Fraud Patterns Analytics', () => {
    it('should return fraud pattern statistics', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.fraudPatterns();

      expect(result).toHaveProperty('totalFraudCases');
      expect(result).toHaveProperty('highRiskLocations');
      expect(result).toHaveProperty('estimatedFraudLoss');
      expect(result).toHaveProperty('avgFraudScore');
      
      expect(typeof result.totalFraudCases).toBe('number');
      expect(typeof result.highRiskLocations).toBe('number');
      expect(typeof result.estimatedFraudLoss).toBe('number');
      expect(typeof result.avgFraudScore).toBe('number');

      // Verify non-negative values
      expect(result.totalFraudCases).toBeGreaterThanOrEqual(0);
      expect(result.highRiskLocations).toBeGreaterThanOrEqual(0);
      expect(result.estimatedFraudLoss).toBeGreaterThanOrEqual(0);
      expect(result.avgFraudScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Fleet Risk Analytics', () => {
    it('should return fleet risk overview', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.fleetRiskOverview();

      expect(result).toHaveProperty('driverCount');
      expect(result).toHaveProperty('vehicleCount');
      expect(result).toHaveProperty('claimCount');
      expect(result).toHaveProperty('avgRiskScore');
      
      expect(typeof result.driverCount).toBe('number');
      expect(typeof result.vehicleCount).toBe('number');
      expect(typeof result.claimCount).toBe('number');
      expect(typeof result.avgRiskScore).toBe('number');

      // Verify non-negative values
      expect(result.driverCount).toBeGreaterThanOrEqual(0);
      expect(result.vehicleCount).toBeGreaterThanOrEqual(0);
      expect(result.claimCount).toBeGreaterThanOrEqual(0);
      expect(result.avgRiskScore).toBeGreaterThanOrEqual(0);
    });

    it('should return driver risk profiles', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.driverProfiles();

      expect(Array.isArray(result)).toBe(true);

      // Verify driver profile structure if available
      if (result.length > 0) {
        const firstDriver = result[0];
        expect(firstDriver).toHaveProperty('driverId');
        expect(firstDriver).toHaveProperty('driverName');
        expect(firstDriver).toHaveProperty('claimCount');
        expect(firstDriver).toHaveProperty('riskScore');
        expect(firstDriver).toHaveProperty('totalClaimCost');
        expect(firstDriver).toHaveProperty('harshBraking');
        expect(firstDriver).toHaveProperty('rapidAcceleration');
        expect(firstDriver).toHaveProperty('speeding');
        
        expect(typeof firstDriver.driverId).toBe('number');
        expect(typeof firstDriver.claimCount).toBe('number');
        expect(typeof firstDriver.riskScore).toBe('number');
        expect(typeof firstDriver.totalClaimCost).toBe('number');
      }
    });
  });

  describe('Panel Beater Performance Analytics', () => {
    it('should return panel beater performance metrics', async () => {
      const caller = appRouter.createCaller(createMockContext(1));
      
      const result = await caller.analytics.panelBeaterPerformance();

      expect(Array.isArray(result)).toBe(true);

      // Verify performance data structure if available
      if (result.length > 0) {
        const firstPanelBeater = result[0];
        expect(firstPanelBeater).toHaveProperty('panelBeaterId');
        expect(firstPanelBeater).toHaveProperty('name');
        expect(firstPanelBeater).toHaveProperty('businessName');
        expect(firstPanelBeater).toHaveProperty('city');
        expect(firstPanelBeater).toHaveProperty('totalJobs');
        expect(firstPanelBeater).toHaveProperty('avgQuote');
        expect(firstPanelBeater).toHaveProperty('avgTurnaroundDays');
        expect(firstPanelBeater).toHaveProperty('customerRating');
        expect(firstPanelBeater).toHaveProperty('onTimePct');
        expect(firstPanelBeater).toHaveProperty('reworkRate');
        
        expect(typeof firstPanelBeater.panelBeaterId).toBe('number');
        expect(typeof firstPanelBeater.totalJobs).toBe('number');
        expect(typeof firstPanelBeater.avgQuote).toBe('number');
        expect(typeof firstPanelBeater.avgTurnaroundDays).toBe('number');
        expect(typeof firstPanelBeater.customerRating).toBe('number');
        expect(typeof firstPanelBeater.onTimePct).toBe('number');
        expect(typeof firstPanelBeater.reworkRate).toBe('number');

        // Verify reasonable ranges
        expect(firstPanelBeater.customerRating).toBeGreaterThanOrEqual(0);
        expect(firstPanelBeater.customerRating).toBeLessThanOrEqual(5);
        expect(firstPanelBeater.onTimePct).toBeGreaterThanOrEqual(0);
        expect(firstPanelBeater.onTimePct).toBeLessThanOrEqual(100);
        expect(firstPanelBeater.reworkRate).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Authentication', () => {
    it('should require authentication for all analytics endpoints', async () => {
      const caller = appRouter.createCaller(createMockContext()); // No user

      // Test each endpoint throws error when not authenticated
      await expect(
        caller.analytics.claimsCostTrend({
          startDate: '2025-01-01',
          endDate: '2026-02-11',
          groupBy: 'month',
        })
      ).rejects.toThrow();

      await expect(
        caller.analytics.costBreakdown({
          startDate: '2025-01-01',
          endDate: '2026-02-11',
          breakdownBy: 'vehicle_make',
        })
      ).rejects.toThrow();

      await expect(caller.analytics.fraudHeatmap()).rejects.toThrow();
      await expect(caller.analytics.fraudPatterns()).rejects.toThrow();
      await expect(caller.analytics.fleetRiskOverview()).rejects.toThrow();
      await expect(caller.analytics.driverProfiles()).rejects.toThrow();
      await expect(caller.analytics.panelBeaterPerformance()).rejects.toThrow();
    });
  });
});
