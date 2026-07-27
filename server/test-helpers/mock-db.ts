/**
 * Mock Database Helper for Workflow Engine Tests
 *
 * Provides reusable mock database with complete MySQL2 query chain.
 * Tables are identified by the drizzle Symbol(drizzle:Name) property so
 * the mock is robust regardless of call order.
 */

import { vi } from "vitest";

const DRIZZLE_NAME = Symbol.for("drizzle:Name");

function tableName(table: any): string {
  return table?.[DRIZZLE_NAME] ?? "";
}

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
  aiAssessments?: any[];
}

/**
 * Create a complete mock database with all query chain methods.
 * Uses drizzle table name symbols for reliable table identification.
 */
export function createMockDb(options: MockDbOptions = {}) {
  const {
    claims = [],
    involvement = [],
    auditTrail = [],
    config = [{ maxSequentialStagesByUser: 2, riskManagerEnabled: true }],
    aiAssessments: aiAssessmentRows = [],
  } = options;

  // Build a synthetic AI assessment row from the first claim if it has aiAssessmentCompleted=true
  const syntheticAssessments =
    aiAssessmentRows.length > 0
      ? aiAssessmentRows
      : claims.filter((c) => c.aiAssessmentCompleted).map((c) => ({
          id: 9000 + c.id,
          claimId: c.id,
          fraudRiskScore: c.fraudRiskScore ?? 0,
          estimatedCost: c.estimatedCost ?? 0,
          status: "completed",
        }));

  /**
   * Build a thenable+limit-able result for a given data array.
   * Awaiting it directly returns the array; calling .limit(n) also returns the array.
   */
  function queryResult(data: any[]) {
    const result: any = {
      limit: vi.fn().mockResolvedValue(data),
      // Make the object itself awaitable (thenable)
      then: (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject),
    };
    return result;
  }

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const name = tableName(table);
        return {
          where: vi.fn((_condition: any) => {
            if (name === "claims") return queryResult(claims.length > 0 ? [claims[0]] : []);
            if (name === "workflow_configuration") return queryResult(config);
            if (name === "claim_involvement_tracking") return queryResult(involvement);
            if (name === "ai_assessments") return queryResult(syntheticAssessments);
            if (name === "workflow_audit_trail") return queryResult(auditTrail);
            // Fallback: return empty
            return queryResult([]);
          }),
          // Support chains without where (e.g. select().from(table).limit(n))
          limit: vi.fn().mockResolvedValue(claims),
        };
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({ insertId: 1 }),
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
