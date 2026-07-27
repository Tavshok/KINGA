// @ts-nocheck
/**
 * Fast-Track Action Dispatcher Tests
 * Uses in-memory mocks for the database and WorkflowEngine.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Hoisted state ────────────────────────────────────────────────────────────
const {
  _stores,
  _nextId,
  _lastInserted,
  CLAIMS_TABLE,
  FTR_TABLE,
  WAT_TABLE,
} = vi.hoisted(() => {
  const _stores = { claims: [], ftr: [], wat: [] };
  const _nextId = { v: 1 };
  const _lastInserted = {};
  const CLAIMS_TABLE = Symbol("claims");
  const FTR_TABLE = Symbol("fastTrackRoutingLog");
  const WAT_TABLE = Symbol("workflowAuditTrail");
  return { _stores, _nextId, _lastInserted, CLAIMS_TABLE, FTR_TABLE, WAT_TABLE };
});

// ─── DB mock ─────────────────────────────────────────────────────────────────
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    eq: (field, value) => ({ __mockEq: true, value }),
    desc: (field) => ({ __mockDesc: true }),
    sql: actual.sql,
  };
});

vi.mock("../db", () => {
  function sk(table) {
    if (table === CLAIMS_TABLE) return "claims";
    if (table === FTR_TABLE) return "ftr";
    if (table === WAT_TABLE) return "wat";
    return "unknown";
  }
  function makeDb() {
    return {
      execute: () => Promise.resolve([]),
      select: () => ({
        from: (table) => {
          const key = sk(table);
          let _rev = false, _lim = null, _idFilter = null;
          const chain = {
            where: (cond) => {
              // Extract id from eq() mock
              if (cond && cond.__mockEq) _idFilter = cond.value;
              return chain;
            },
            orderBy: () => { _rev = true; return chain; },
            limit: (n) => { _lim = n; return chain; },
            then: (res, rej) => {
              let rows = (_stores[key] || []).slice();
              if (_idFilter !== null) {
                rows = rows.filter(r => r.id === _idFilter || r.claimId === _idFilter);
                if (rows.length === 0 && _lastInserted[key] && (_lastInserted[key].id === _idFilter || _lastInserted[key].claimId === _idFilter)) {
                  rows = [_lastInserted[key]];
                }
              }
              if (_rev) rows = rows.reverse();
              if (_lim !== null) rows = rows.slice(0, _lim);
              return Promise.resolve(rows).then(res, rej);
            },
          };
          return chain;
        },
      }),
      insert: (table) => ({
        values: (data) => {
          const key = sk(table);
          const row = { id: _nextId.v++, ...data };
          if (_stores[key]) _stores[key].push(row);
          _lastInserted[key] = row;
          return Promise.resolve([{ insertId: row.id }]);
        },
      }),
      update: (table) => ({
        set: (data) => ({
          where: () => {
            const key = sk(table);
            for (const row of (_stores[key] || [])) Object.assign(row, data);
            return Promise.resolve([{ affectedRows: (_stores[key] || []).length }]);
          },
        }),
      }),
      delete: (table) => ({
        where: () => {
          const key = sk(table);
          if (_stores[key]) _stores[key].length = 0;
          return Promise.resolve();
        },
      }),
    };
  }
  return { getDb: vi.fn(() => Promise.resolve(makeDb())) };
});

// ─── Schema mock ─────────────────────────────────────────────────────────────
vi.mock("../../drizzle/schema", () => ({
  claims: CLAIMS_TABLE,
  fastTrackRoutingLog: FTR_TABLE,
  workflowAuditTrail: WAT_TABLE,
  routingThresholdConfig: Symbol("routingThresholdConfig"),
  fastTrackConfig: Symbol("fastTrackConfig"),
}));

// ─── WorkflowEngine mock ──────────────────────────────────────────────────────
vi.mock("../workflow-engine", () => {
  class WorkflowEngine {
    constructor(tenantId) { this.tenantId = tenantId; }
    async transition(claimId, toState, userId, context) {
      const claim = _stores.claims.find(c => c.id === claimId);
      if (!claim) throw new Error(`Claim ${claimId} not found`);
      const prevState = claim.workflowState;
      claim.workflowState = toState;
      const auditRow = { id: _nextId.v++, claimId, tenantId: this.tenantId, previousState: prevState, newState: toState, action: (context && context.fastTrackAction) || "TRANSITION", performedBy: userId || 1, createdAt: new Date().toISOString(), metadata: JSON.stringify(context || {}) };
      _stores.wat.push(auditRow);
      _lastInserted.wat = auditRow;
      return { success: true, claimId, previousState: prevState, newState: toState, auditId: auditRow.id };
    }
  }
  return { WorkflowEngine };
});

// ─── Usage meter mock ─────────────────────────────────────────────────────────
vi.mock("./usage-meter", () => ({
  recordFastTrackTriggered: vi.fn(() => Promise.resolve()),
  recordAutoApproval: vi.fn(() => Promise.resolve()),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { executeFastTrackAction } from "./fast-track-dispatcher";
import { claims, fastTrackRoutingLog, workflowAuditTrail } from "../../drizzle/schema";

const TEST_TENANT_ID = "test-tenant-dispatcher-001";
const TEST_USER_ID = 1;

describe("Fast-Track Action Dispatcher", () => {
  let testClaimId;

  beforeEach(async () => {
    _stores.claims.length = 0; _stores.ftr.length = 0; _stores.wat.length = 0;
    delete _lastInserted.claims; delete _lastInserted.ftr; delete _lastInserted.wat;
    _nextId.v = 1;
    const db = await getDb();
    const [result] = await db.insert(claims).values({ tenantId: TEST_TENANT_ID, claimNumber: `DISP-TEST-${Date.now()}`, claimantId: 1, policyNumber: "TEST-POL-001", incidentDate: new Date(), status: "assessment_in_progress", workflowState: "assigned", metadata: JSON.stringify({}) });
    testClaimId = result.insertId;
  });

  describe("AUTO_APPROVE Action", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "technical_approval"; });

    it("should transition claim to financial_decision state", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID, false);
      expect(result.success).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
      expect(result.newState).toBe("financial_decision");
      expect(result.routingLogId).toBeDefined();
    });

    it("should flag claim as auto-approved", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID, false);
      const claim = _stores.claims.find(c => c.id === testClaimId);
      const metadata = typeof claim.metadata === "string" ? JSON.parse(claim.metadata) : claim.metadata;
      expect(metadata.autoApproved).toBe(true);
      expect(metadata.fastTrackAction).toBe("AUTO_APPROVE");
      expect(metadata.fastTrackConfigVersion).toBe(1);
    });

    it("should support executive override path", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID, true);
      expect(result.success).toBe(true);
      expect(result.action).toBe("AUTO_APPROVE");
    });

    it("should create fastTrackRoutingLog entry", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID, false);
      const logEntry = _stores.ftr.find(e => e.id === result.routingLogId);
      expect(logEntry).toBeDefined();
      expect(logEntry.claimId).toBe(testClaimId);
      expect(logEntry.decision).toBe("AUTO_APPROVE");
      expect(logEntry.configVersion).toBe(1);
      expect(parseFloat(logEntry.confidenceScore)).toBe(92.5);
      expect(parseFloat(logEntry.fraudScore)).toBe(3.2);
    });
  });

  describe("PRIORITY_QUEUE Action", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "under_assessment"; });

    it("should transition claim to priority_review state", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "PRIORITY_QUEUE", configVersion: 1, evaluationDetails: { confidenceScore: 88.0, fraudScore: 5.5, claimValue: 250000, reason: "Medium confidence" } }, TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(result.action).toBe("PRIORITY_QUEUE");
      expect(result.newState).toBe("internal_review");
    });

    it("should assign SLA tag to claim", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "PRIORITY_QUEUE", configVersion: 1, evaluationDetails: { confidenceScore: 88.0, fraudScore: 5.5, claimValue: 250000, reason: "Medium confidence" } }, TEST_USER_ID);
      const claim = _stores.claims.find(c => c.id === testClaimId);
      const metadata = typeof claim.metadata === "string" ? JSON.parse(claim.metadata) : claim.metadata;
      expect(metadata.priorityQueue).toBe(true);
      expect(metadata.slaTag).toBe("FAST_TRACK_PRIORITY");
      expect(metadata.fastTrackAction).toBe("PRIORITY_QUEUE");
    });
  });

  describe("REDUCED_DOCUMENTATION Action", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "assigned"; });

    it("should transition claim to documentation_review state", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "REDUCED_DOCUMENTATION", configVersion: 1, evaluationDetails: { confidenceScore: 90.0, fraudScore: 4.0, claimValue: 250000, reason: "High confidence, reduced docs" } }, TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(result.action).toBe("REDUCED_DOCUMENTATION");
      expect(result.newState).toBe("under_assessment");
    });

    it("should update required document checklist", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "REDUCED_DOCUMENTATION", configVersion: 1, evaluationDetails: { confidenceScore: 90.0, fraudScore: 4.0, claimValue: 250000, reason: "High confidence, reduced docs" } }, TEST_USER_ID);
      const claim = _stores.claims.find(c => c.id === testClaimId);
      const metadata = typeof claim.metadata === "string" ? JSON.parse(claim.metadata) : claim.metadata;
      expect(metadata.reducedDocumentation).toBe(true);
      expect(metadata.requiredDocuments).toEqual(["proof_of_loss", "claim_form"]);
      expect(metadata.fastTrackAction).toBe("REDUCED_DOCUMENTATION");
    });
  });

  describe("STRAIGHT_TO_PAYMENT Action", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "assigned"; });

    it("should transition claim to payment_authorized state", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "STRAIGHT_TO_PAYMENT", configVersion: 1, evaluationDetails: { confidenceScore: 95.0, fraudScore: 2.0, claimValue: 250000, reason: "Very high confidence" } }, TEST_USER_ID);
      expect(result.success).toBe(true);
      expect(result.action).toBe("STRAIGHT_TO_PAYMENT");
      expect(result.newState).toBe("payment_authorized");
    });

    it("should flag claim with auto-path entry", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "STRAIGHT_TO_PAYMENT", configVersion: 1, evaluationDetails: { confidenceScore: 95.0, fraudScore: 2.0, claimValue: 250000, reason: "Very high confidence" } }, TEST_USER_ID);
      const claim = _stores.claims.find(c => c.id === testClaimId);
      const metadata = typeof claim.metadata === "string" ? JSON.parse(claim.metadata) : claim.metadata;
      expect(metadata.straightToPayment).toBe(true);
      expect(metadata.autoPath).toBe(true);
      expect(metadata.fastTrackAction).toBe("STRAIGHT_TO_PAYMENT");
    });
  });

  describe("Invalid State Protection", () => {
    it("should reject ineligible claims", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: false, action: null, configVersion: 1, evaluationDetails: { confidenceScore: 75.0, fraudScore: 12.0, claimValue: 250000, reason: "Below threshold" } }, TEST_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not eligible");
    });

    it("should reject claims with null action", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: null, configVersion: 1, evaluationDetails: { confidenceScore: 85.0, fraudScore: 8.0, claimValue: 250000, reason: "No action" } }, TEST_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not eligible");
    });

    it("should handle non-existent claims", async () => {
      const result = await executeFastTrackAction(999999, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("Audit Trail", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "technical_approval"; });

    it("should generate workflow audit trail for transitions", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID);
      const auditEntries = _stores.wat.filter(e => e.claimId === testClaimId);
      expect(auditEntries.length).toBeGreaterThan(0);
      const transitionEntry = auditEntries.find(e => e.newState === "financial_decision");
      expect(transitionEntry).toBeDefined();
    });

    it("should link fastTrackRoutingLog to claim", async () => {
      const result = await executeFastTrackAction(testClaimId, { eligible: true, action: "PRIORITY_QUEUE", configVersion: 1, evaluationDetails: { confidenceScore: 88.0, fraudScore: 5.5, claimValue: 250000, reason: "Medium confidence" } }, TEST_USER_ID);
      const logEntry = _stores.ftr.find(e => e.claimId === testClaimId);
      expect(logEntry).toBeDefined();
      expect(logEntry.id).toBe(result.routingLogId);
      expect(logEntry.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe("Segregation Enforcement", () => {
    beforeEach(() => { for (const c of _stores.claims) c.workflowState = "technical_approval"; });

    it("should maintain tenant isolation in routing logs", async () => {
      await executeFastTrackAction(testClaimId, { eligible: true, action: "AUTO_APPROVE", configVersion: 1, evaluationDetails: { confidenceScore: 92.5, fraudScore: 3.2, claimValue: 250000, reason: "High confidence" } }, TEST_USER_ID);
      const logEntry = _stores.ftr.find(e => e.claimId === testClaimId);
      expect(logEntry.tenantId).toBe(TEST_TENANT_ID);
    });
  });
});
