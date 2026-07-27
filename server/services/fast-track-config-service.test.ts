// @ts-nocheck
/**
 * Fast-Track Configuration Service Tests
 *
 * Uses an in-memory mock for the database so no real DB connection is needed.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Hoisted state (accessible in vi.mock factories) ─────────────────────────
const {
  _stores,
  _nextId,
  _lastInserted,
  FTC_TABLE,
  GOV_TABLE,
  VIOL_TABLE,
  CLAIMS_TABLE,
} = vi.hoisted(() => {
  const _stores = {
    ftc: [] as any[],
    gov: [] as any[],
    viol: [] as any[],
  };
  const _nextId = { v: 1 };
  const _lastInserted: Record<string, any> = {};
  const FTC_TABLE = Symbol("fastTrackConfig");
  const GOV_TABLE = Symbol("platformGovernanceLimits");
  const VIOL_TABLE = Symbol("governanceViolationLog");
  const CLAIMS_TABLE = Symbol("claims");
  return { _stores, _nextId, _lastInserted, FTC_TABLE, GOV_TABLE, VIOL_TABLE, CLAIMS_TABLE };
});

// ─── DB mock ─────────────────────────────────────────────────────────────────
vi.mock("../db", () => {
  function makeDb() {
    return {
      select: () => ({
        from: (table: symbol) => {
          let storeKey: string;
          if (table === FTC_TABLE) storeKey = "ftc";
          else if (table === GOV_TABLE) storeKey = "gov";
          else if (table === VIOL_TABLE) storeKey = "viol";
          else storeKey = "unknown";

          let _rev = false;
          let _lim: number | null = null;
          let _useLastInserted = false;

          const chain: any = {
            where: (_cond: any) => {
              // Heuristic: if the condition is an eq(id, ...) lookup (no orderBy follows),
              // we flag to return the last inserted row for this table.
              // This handles the pattern: db.select().from(t).where(eq(t.id, insertId)).limit(1)
              _useLastInserted = true;
              return chain;
            },
            orderBy: (_ord: any) => {
              _rev = true;
              _useLastInserted = false; // orderBy means it's a range query, not id lookup
              return chain;
            },
            limit: (n: number) => { _lim = n; return chain; },
            then: (res: any, rej: any) => {
              let rows: any[];
              if (_useLastInserted && _lastInserted[storeKey]) {
                // Return the last inserted row for this table (id lookup pattern)
                rows = [_lastInserted[storeKey]];
              } else {
                rows = _stores[storeKey]?.slice() ?? [];
                if (_rev) rows = rows.reverse();
              }
              if (_lim !== null) rows = rows.slice(0, _lim);
              return Promise.resolve(rows).then(res, rej);
            },
          };
          return chain;
        },
      }),

      insert: (table: symbol) => ({
        values: (data: any) => {
          const row = { id: _nextId.v++, ...data };
          let storeKey: string;
          if (table === FTC_TABLE) storeKey = "ftc";
          else if (table === GOV_TABLE) storeKey = "gov";
          else if (table === VIOL_TABLE) storeKey = "viol";
          else storeKey = "unknown";

          if (_stores[storeKey]) _stores[storeKey].push(row);
          _lastInserted[storeKey] = row;
          return Promise.resolve([{ insertId: row.id }]);
        },
      }),

      delete: (table: symbol) => {
        if (table === FTC_TABLE) { _stores.ftc.length = 0; delete _lastInserted.ftc; }
        else if (table === GOV_TABLE) { _stores.gov.length = 0; delete _lastInserted.gov; }
        else if (table === VIOL_TABLE) { _stores.viol.length = 0; delete _lastInserted.viol; }
        return Promise.resolve();
      },
    };
  }
  return { getDb: vi.fn(() => Promise.resolve(makeDb())) };
});

// ─── Schema mock ─────────────────────────────────────────────────────────────
vi.mock("../../drizzle/schema", () => ({
  fastTrackConfig: FTC_TABLE,
  platformGovernanceLimits: GOV_TABLE,
  governanceViolationLog: VIOL_TABLE,
  claims: CLAIMS_TABLE,
}));

// ─── Import service after mocks ───────────────────────────────────────────────
import {
  createFastTrackConfig,
  getActiveGovernanceLimits,
  getGovernanceViolations,
  GovernanceViolationError,
  type CreateFastTrackConfigParams,
} from "./fast-track-config-service";

const TEST_TENANT_ID = "test-tenant-gov-001";
const TEST_USER_ID = 1;

describe("Fast-Track Configuration Service - Governance Guardrails", () => {
  beforeEach(() => {
    _stores.ftc.length = 0;
    _stores.gov.length = 0;
    _stores.viol.length = 0;
    delete _lastInserted.ftc;
    delete _lastInserted.gov;
    delete _lastInserted.viol;
    _nextId.v = 1;
  });

  describe("Platform Governance Limits", () => {
    it("should retrieve active governance limits", async () => {
      const limits = await getActiveGovernanceLimits();
      expect(limits).toBeDefined();
      expect(limits?.maxAutoApprovalLimitGlobal).toBe(5000000);
      expect(limits?.minConfidenceAllowedGlobal).toBe("85.00");
      expect(limits?.maxFraudToleranceGlobal).toBe("10.00");
    });

    it("should return default limits if none configured", async () => {
      const limits = await getActiveGovernanceLimits();
      expect(limits).toBeDefined();
      expect(limits?.maxAutoApprovalLimitGlobal).toBe(5000000);
      expect(limits?.minConfidenceAllowedGlobal).toBe("85.00");
      expect(limits?.maxFraudToleranceGlobal).toBe("10.00");
    });
  });

  describe("Threshold Validation", () => {
    it("should reject confidence score below minimum (85%)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow(GovernanceViolationError);
    });

    it("should reject fraud tolerance above maximum (10%)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "15.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow(GovernanceViolationError);
    });

    it("should reject auto-approval above global financial limit (R50,000)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 6000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "Executive",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow(GovernanceViolationError);
    });

    it("should accept valid configuration within all limits", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      const config = await createFastTrackConfig(params);
      expect(config).toBeDefined();
      expect(config.fastTrackAction).toBe("AUTO_APPROVE");
    });
  });

  describe("Boundary Edge Cases", () => {
    it("should accept confidence score exactly at minimum (85%)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "85.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      const config = await createFastTrackConfig(params);
      expect(config).toBeDefined();
    });

    it("should accept fraud score exactly at maximum (10%)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "10.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      const config = await createFastTrackConfig(params);
      expect(config).toBeDefined();
    });

    it("should reject confidence score just below minimum (84.99%)", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "84.99",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow(GovernanceViolationError);
    });
  });

  describe("Justification Requirements", () => {
    it("should reject AUTO_APPROVE without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
    });

    it("should reject justification shorter than 20 characters", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "Too short",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
    });

    it("should accept AUTO_APPROVE with valid justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      const config = await createFastTrackConfig(params);
      expect(config).toBeDefined();
      expect(config.fastTrackAction).toBe("AUTO_APPROVE");
    });

    it("should reject STRAIGHT_TO_PAYMENT without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "STRAIGHT_TO_PAYMENT",
        minConfidenceScore: "95.00",
        maxClaimValue: 2000000,
        maxFraudScore: "3.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "Executive",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
    });

    it("should allow PRIORITY_QUEUE without justification", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };
      const config = await createFastTrackConfig(params);
      expect(config).toBeDefined();
      expect(config.fastTrackAction).toBe("PRIORITY_QUEUE");
    });
  });

  describe("Audit Trail", () => {
    it("should record actor, role, and tenantId in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "80.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      expect(violations[0].tenantId).toBe(TEST_TENANT_ID);
      expect(violations[0].userId).toBe(TEST_USER_ID);
      expect(violations[0].userRole).toBe("ClaimsManager");
      expect(violations[0].violationType).toBe("BELOW_MIN_CONFIDENCE");
    });

    it("should store attempted config snapshot in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "AUTO_APPROVE",
        minConfidenceScore: "90.00",
        maxClaimValue: 6000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "Executive",
        justification: "This is a valid justification with more than 20 characters",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      const attemptedConfig = JSON.parse(violations[0].attemptedConfig);
      expect(attemptedConfig.maxClaimValue).toBe(6000000);
      expect(attemptedConfig.fastTrackAction).toBe("AUTO_APPROVE");
    });

    it("should store governance limits snapshot in violation log", async () => {
      const params: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "75.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };
      await expect(createFastTrackConfig(params)).rejects.toThrow();
      const violations = await getGovernanceViolations(TEST_TENANT_ID);
      expect(violations).toHaveLength(1);
      const limitsSnapshot = JSON.parse(violations[0].governanceLimitsSnapshot);
      expect(limitsSnapshot.maxAutoApprovalLimit).toBe(5000000);
      expect(limitsSnapshot.minConfidenceAllowed).toBe("85.00");
      expect(limitsSnapshot.maxFraudTolerance).toBe("10.00");
    });
  });

  describe("Version Immutability", () => {
    it("should increment version for each new config", async () => {
      const params1: CreateFastTrackConfigParams = {
        tenantId: TEST_TENANT_ID,
        fastTrackAction: "PRIORITY_QUEUE",
        minConfidenceScore: "90.00",
        maxClaimValue: 3000000,
        maxFraudScore: "5.00",
        enabled: 1,
        effectiveFrom: new Date(),
        createdBy: TEST_USER_ID,
        userRole: "ClaimsManager",
      };
      const config1 = await createFastTrackConfig(params1);
      expect(config1.version).toBe(1);

      const config2 = await createFastTrackConfig({ ...params1, minConfidenceScore: "92.00" });
      expect(config2.version).toBe(2);
    });
  });
});
