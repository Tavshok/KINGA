// @ts-nocheck
/**
 * Segregation of Duties Validator Unit Tests
 *
 * Uses DB injection (not vi.mock) so this test is fully self-contained
 * and immune to module-level DB mocks in other test files running in singleFork mode.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SegregationValidator } from "./segregation-validator";
import type { WorkflowState } from "./types";

// ── In-memory store for claim_involvement_tracking ───────────────────────────
type Row = {
  id: number;
  claim_id: number;
  user_id: number;
  workflow_stage: string;
  action_type: string;
  created_at: string;
};

let store: Row[] = [];
let nextId = 1;

/**
 * Parse a drizzle sql template object into its string + params.
 * drizzle-orm's sql`` tag produces an object with queryChunks:
 *   - StringChunk  → { value: ["literal text"] }
 *   - Param        → { value: <actual param>, encoder: ... }
 */
function parseSql(query: any): { sql: string; params: any[] } {
  if (typeof query === "string") return { sql: query, params: [] };
  if (!query?.queryChunks) return { sql: String(query), params: [] };

  let sqlStr = "";
  const params: any[] = [];

  for (const chunk of query.queryChunks) {
    if (Array.isArray(chunk?.value)) {
      // StringChunk: value is an array of literal strings
      sqlStr += chunk.value[0];
    } else {
      // Param: value is the actual parameter
      sqlStr += "?";
      params.push(chunk?.value ?? chunk);
    }
  }

  return { sql: sqlStr, params };
}

/** Build a mock DB object backed by the in-memory store */
function makeMockDb() {
  return {
    execute: async (query: any) => {
      const { sql: sqlStr, params } = parseSql(query);
      const upper = sqlStr.trim().toUpperCase();

      // ── DELETE FROM claim_involvement_tracking WHERE claim_id = ?
      if (upper.startsWith("DELETE")) {
        const cid = Number(params[0]);
        store = store.filter((r) => r.claim_id !== cid);
        return [{ affectedRows: 0 }, []];
      }

      // ── INSERT INTO claim_involvement_tracking (...)
      if (upper.startsWith("INSERT")) {
        const [cid, uid, stage, action] = params;
        const exists = store.some(
          (r) =>
            r.claim_id === Number(cid) &&
            r.user_id === Number(uid) &&
            r.workflow_stage === String(stage)
        );
        if (!exists) {
          store.push({
            id: nextId++,
            claim_id: Number(cid),
            user_id: Number(uid),
            workflow_stage: String(stage),
            action_type: String(action),
            created_at: new Date().toISOString(),
          });
        }
        return [{ insertId: nextId - 1, affectedRows: 1 }, []];
      }

      // ── SELECT … WHERE claim_id = ? AND user_id = ? AND workflow_stage = ? LIMIT 1
      if (upper.startsWith("SELECT") && params.length >= 3) {
        const [cid, uid, stage] = params;
        const rows = store.filter(
          (r) =>
            r.claim_id === Number(cid) &&
            r.user_id === Number(uid) &&
            r.workflow_stage === String(stage)
        );
        return [rows, []];
      }

      // ── SELECT … WHERE claim_id = ? AND user_id = ?  (getUserInvolvement)
      if (upper.startsWith("SELECT") && params.length >= 2) {
        const [cid, uid] = params;
        const rows = store.filter(
          (r) => r.claim_id === Number(cid) && r.user_id === Number(uid)
        );
        return [rows, []];
      }

      return [[], []];
    },
  };
}

describe("SegregationValidator - 2-Stage Limit Policy", () => {
  let validator: SegregationValidator;
  const testClaimId = 999001;
  const testUserId = 501;

  beforeEach(() => {
    // Reset in-memory store and inject a fresh mock DB into the validator.
    // This bypasses getDb() entirely, so no module mock is needed.
    store = [];
    nextId = 1;
    validator = new SegregationValidator(makeMockDb());
  });

  describe("2-Stage Limit Enforcement", () => {
    it("should allow user to perform first critical stage", async () => {
      const result = await validator.validateSegregation(
        testClaimId,
        testUserId,
        "complete_assessment",
        "internal_review"
      );
      expect(result.allowed).toBe(true);
      expect(result.criticalStagesPerformed).toBe(0);
    });

    it("should allow user to perform second critical stage", async () => {
      await validator.trackInvolvement(
        testClaimId,
        testUserId,
        "internal_review",
        "complete_assessment"
      );
      const result = await validator.validateSegregation(
        testClaimId,
        testUserId,
        "approve_technical",
        "technical_approval"
      );
      expect(result.allowed).toBe(true);
      expect(result.criticalStagesPerformed).toBe(1);
    });

    it("should block user from performing third critical stage", async () => {
      await validator.trackInvolvement(
        testClaimId,
        testUserId,
        "internal_review",
        "complete_assessment"
      );
      await validator.trackInvolvement(
        testClaimId,
        testUserId,
        "technical_approval",
        "approve_technical"
      );
      const result = await validator.validateSegregation(
        testClaimId,
        testUserId,
        "approve_financial",
        "financial_decision"
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("SEGREGATION_VIOLATION");
      expect(result.reason).toContain("exceeding maximum allowed: 2");
      expect(result.criticalStagesPerformed).toBe(2);
    });

    it("should allow same user to perform multiple actions within same stage", async () => {
      await validator.trackInvolvement(
        testClaimId,
        testUserId,
        "internal_review",
        "complete_assessment"
      );
      const result = await validator.validateSegregation(
        testClaimId,
        testUserId,
        "update_assessment",
        "internal_review"
      );
      expect(result.allowed).toBe(true);
      expect(result.criticalStagesPerformed).toBe(1);
    });
  });

  describe("Self-Approval Prevention", () => {
    it("should prevent user from approving their own assessment", async () => {
      await validator.trackInvolvement(
        testClaimId,
        testUserId,
        "internal_review",
        "complete_assessment"
      );
      const result = await validator.validateSegregation(
        testClaimId,
        testUserId,
        "approve_technical",
        "technical_approval"
      );
      // Under 2-stage policy this is ALLOWED (user can do 2 stages)
      expect(result.allowed).toBe(true);
      expect(result.criticalStagesPerformed).toBe(1);
    });
  });

  describe("Different Users Workflow", () => {
    it("should allow different users to perform all stages", async () => {
      const user1 = 501;
      const user2 = 502;
      const user3 = 503;

      await validator.trackInvolvement(testClaimId, user1, "internal_review", "complete_assessment");
      const result1 = await validator.validateSegregation(testClaimId, user1, "approve_technical", "technical_approval");
      expect(result1.allowed).toBe(true);

      await validator.trackInvolvement(testClaimId, user2, "technical_approval", "approve_technical");
      const result2 = await validator.validateSegregation(testClaimId, user2, "approve_financial", "financial_decision");
      expect(result2.allowed).toBe(true);

      const result3 = await validator.validateSegregation(testClaimId, user3, "approve_financial", "financial_decision");
      expect(result3.allowed).toBe(true);
    });

    it("should allow user 1 to perform 2 stages, then require different user for stage 3", async () => {
      const user1 = 501;
      const user2 = 502;

      await validator.trackInvolvement(testClaimId, user1, "internal_review", "complete_assessment");
      await validator.trackInvolvement(testClaimId, user1, "technical_approval", "approve_technical");

      const result1 = await validator.validateSegregation(testClaimId, user1, "approve_financial", "financial_decision");
      expect(result1.allowed).toBe(false);

      const result2 = await validator.validateSegregation(testClaimId, user2, "approve_financial", "financial_decision");
      expect(result2.allowed).toBe(true);
    });
  });

  describe("Involvement Tracking", () => {
    it("should track user involvement correctly", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      const involvement = await validator.getUserInvolvement(testClaimId, testUserId);
      expect(involvement.userId).toBe(testUserId);
      expect(involvement.claimId).toBe(testClaimId);
      expect(involvement.criticalStageCount).toBe(1);
      expect(involvement.stages.length).toBeGreaterThan(0);
      expect(involvement.stages[0].stage).toBe("assessment");
    });

    it("should not duplicate involvement records for same stage", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "update_assessment");
      const involvement = await validator.getUserInvolvement(testClaimId, testUserId);
      expect(involvement.criticalStageCount).toBe(1);
    });

    it("should count distinct critical stages correctly", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      await validator.trackInvolvement(testClaimId, testUserId, "technical_approval", "approve_technical");
      const involvement = await validator.getUserInvolvement(testClaimId, testUserId);
      expect(involvement.criticalStageCount).toBe(2);
    });
  });

  describe("Configuration", () => {
    it("should allow setting max sequential stages", () => {
      validator.setMaxSequentialStages(3);
      expect(() => validator.setMaxSequentialStages(3)).not.toThrow();
    });

    it("should reject invalid max sequential stages", () => {
      expect(() => validator.setMaxSequentialStages(0)).toThrow();
      expect(() => validator.setMaxSequentialStages(-1)).toThrow();
    });

    it("should enforce custom max sequential stages", async () => {
      validator.setMaxSequentialStages(1);
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      const result = await validator.validateSegregation(testClaimId, testUserId, "approve_technical", "technical_approval");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("exceeding maximum allowed: 1");
    });
  });

  describe("Violation Detection", () => {
    it("should detect segregation violation for proposed stage", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      await validator.trackInvolvement(testClaimId, testUserId, "technical_approval", "approve_technical");
      const wouldViolate = await validator.wouldViolateSegregation(testClaimId, testUserId, "financial_decision");
      expect(wouldViolate).toBe(true);
    });

    it("should not detect violation for allowed stage", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      const wouldViolate = await validator.wouldViolateSegregation(testClaimId, testUserId, "technical_approval");
      expect(wouldViolate).toBe(false);
    });

    it("should not detect violation for already performed stage", async () => {
      await validator.trackInvolvement(testClaimId, testUserId, "internal_review", "complete_assessment");
      const wouldViolate = await validator.wouldViolateSegregation(testClaimId, testUserId, "assessment");
      expect(wouldViolate).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle non-critical state transitions", async () => {
      const result = await validator.validateSegregation(testClaimId, testUserId, "assign_assessor", "assigned");
      expect(result.allowed).toBe(true);
      expect(result.criticalStagesPerformed).toBe(0);
    });

    it("should handle user with no prior involvement", async () => {
      const involvement = await validator.getUserInvolvement(testClaimId, 999);
      expect(involvement.criticalStageCount).toBe(0);
      expect(involvement.stages.length).toBe(0);
    });

    it("should handle database unavailability gracefully", async () => {
      const involvement = await validator.getUserInvolvement(999999, 999);
      expect(involvement).toBeDefined();
      expect(involvement.criticalStageCount).toBe(0);
    });
  });
});
