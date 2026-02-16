/**
 * Mock Database Helper for Workflow Engine Tests
 * 
 * Provides reusable mock database with complete MySQL2 query chain
 */

import { vi } from "vitest";

export interface MockClaim {
  id: number;
  workflowState: string;
  status: string;
  tenantId?: string;
  aiAssessmentCompleted?: boolean;
  fraudRiskScore?: number;
  estimatedCost?: number;
  [key: string]: any;
}

export interface MockDbOptions {
  claims?: MockClaim[];
  involvement?: any[];
  auditTrail?: any[];
  config?: any[];
}

/**
 * Create a complete mock database with all query chain methods
 */
export function createMockDb(options: MockDbOptions = {}) {
  const {
    claims = [],
    involvement = [],
    auditTrail = [],
    config = [{ maxSequentialStagesByUser: 2 }],
  } = options;

  // Track which query is being executed based on call order
  let selectCallCount = 0;
  let currentUserId: number | null = null;

  const mockDb = {
    select: vi.fn(() => {
      selectCallCount++;
      const currentCall = selectCallCount;

      return {
        from: vi.fn((table) => {
          // Check table type to determine query pattern
          const tableName = table?.constructor?.name || "";
          
          return {
            where: vi.fn((condition: any) => {
              // Try to extract userId from condition for involvement filtering
              const conditionStr = String(condition);
              const userIdMatch = conditionStr.match(/userId.*?(\d+)/);
              if (userIdMatch) {
                currentUserId = parseInt(userIdMatch[1]);
              }

              // Claims table queries (no limit)
              if (tableName.includes("claims") || currentCall === 1) {
                return Promise.resolve(claims.length > 0 ? [claims[0]] : []);
              }
              // Config table queries (with limit)
              if (tableName.includes("Configuration") || currentCall === 2) {
                return {
                  limit: vi.fn().mockResolvedValue(config),
                };
              }
              // Involvement tracking queries - filter by userId if available
              if (tableName.includes("Involvement") || currentCall === 3) {
                const filtered = currentUserId 
                  ? involvement.filter(i => i.userId === currentUserId)
                  : involvement;
                return Promise.resolve(filtered);
              }
              // Audit trail or other queries
              return Promise.resolve(auditTrail);
            }),
          };
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    }),
    execute: vi.fn().mockResolvedValue([]),
  };

  return mockDb;
}

/**
 * Reset mock database for next test
 */
export function resetMockDb(mockDb: any) {
  mockDb.select.mockClear();
  mockDb.update.mockClear();
  mockDb.insert.mockClear();
  mockDb.execute.mockClear();
}
