/**
 * AUDIT-01 Verification Tests
 *
 * Confirms that each redirected file writes to the correct audit table
 * with the correct field values. These tests require a live DB connection.
 *
 * Run with: pnpm test server/audit-01.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import {
  workflowAuditTrail,
  isoAuditLogs,
  auditTrail,
  superAuditSessions,
} from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { SYSTEM_USER_ID, insertIsoAuditLog, insertWorkflowAudit } from "./utils/audit-helpers";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getLatestWorkflowAudit(db: any) {
  const [row] = await db
    .select()
    .from(workflowAuditTrail)
    .orderBy(desc(workflowAuditTrail.id))
    .limit(1);
  return row;
}

async function getLatestIsoAuditLog(db: any) {
  const [row] = await db
    .select()
    .from(isoAuditLogs)
    .orderBy(desc(isoAuditLogs.id))
    .limit(1);
  return row;
}

async function getLatestAuditTrail(db: any) {
  const [row] = await db
    .select()
    .from(auditTrail)
    .orderBy(desc(auditTrail.id))
    .limit(1);
  return row;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AUDIT-01: Correct audit table routing", () => {
  let db: any;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("DB unavailable — cannot run AUDIT-01 tests");
  });

  // ── 1. ai-rerun-service.ts → workflowAuditTrail ──────────────────────────
  it("insertWorkflowAudit writes to workflowAuditTrail with correct fields", async () => {
    const testClaimId = 99999901;
    const testUserId = 99999901;

    await insertWorkflowAudit(db, {
      claimId: testClaimId,
      userId: testUserId,
      userRole: "claims_processor",
      previousState: "intake_queue",
      newState: "under_assessment",
      comments: "AUDIT-01 test entry",
      metadata: { test: true, source: "audit-01.test.ts" },
    });

    const row = await getLatestWorkflowAudit(db);
    expect(row).toBeDefined();
    expect(row.claimId).toBe(testClaimId);
    expect(row.userId).toBe(testUserId);
    expect(row.userRole).toBe("claims_processor");
    expect(row.previousState).toBe("intake_queue");
    expect(row.newState).toBe("under_assessment");
    expect(row.comments).toBe("AUDIT-01 test entry");
    // metadata is stored as JSON string
    const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    expect(meta.test).toBe(true);
    expect(meta.source).toBe("audit-01.test.ts");
  });

  // ── 2. intake-escalation-job.ts → isoAuditLogs ───────────────────────────
  it("insertIsoAuditLog (system actor) writes to isoAuditLogs with integrityHash", async () => {
    const testTenantId = "AUDIT01-TEST-TENANT";

    await insertIsoAuditLog(db, {
      tenantId: testTenantId,
      userId: SYSTEM_USER_ID,
      userRole: "system",
      actionType: "update",
      resourceType: "claim",
      resourceId: "99999901",
      beforeState: null,
      afterState: JSON.stringify({ actionType: "INTAKE_ESCALATION", test: true }),
    });

    const row = await getLatestIsoAuditLog(db);
    expect(row).toBeDefined();
    expect(row.tenantId).toBe(testTenantId);
    expect(row.userId).toBe(SYSTEM_USER_ID);
    expect(row.userRole).toBe("system");
    expect(row.actionType).toBe("update");
    expect(row.resourceType).toBe("claim");
    expect(row.resourceId).toBe("99999901");
    // integrityHash must be present and non-empty
    expect(row.integrityHash).toBeTruthy();
    expect(row.integrityHash.length).toBe(64); // SHA-256 hex = 64 chars
    // afterState must be stored
    const after = typeof row.afterState === "string" ? JSON.parse(row.afterState) : row.afterState;
    expect(after.actionType).toBe("INTAKE_ESCALATION");
  });

  // ── 3. routing-policy-version-manager.ts → isoAuditLogs ──────────────────
  it("insertIsoAuditLog (human actor) writes to isoAuditLogs with correct fields", async () => {
    const testTenantId = "AUDIT01-TEST-TENANT";
    const testUserId = 99999902;

    await insertIsoAuditLog(db, {
      tenantId: testTenantId,
      userId: testUserId,
      userRole: "insurer_admin",
      actionType: "create",
      resourceType: "routing_policy",
      resourceId: "policy-v2-test",
      beforeState: null,
      afterState: JSON.stringify({ policyVersion: 2, test: true }),
    });

    const row = await getLatestIsoAuditLog(db);
    expect(row).toBeDefined();
    expect(row.userId).toBe(testUserId);
    expect(row.userRole).toBe("insurer_admin");
    expect(row.actionType).toBe("create");
    expect(row.resourceType).toBe("routing_policy");
    expect(row.integrityHash).toBeTruthy();
    expect(row.integrityHash.length).toBe(64);
  });

  // ── 4. super-audit-mode.ts → audit_trail (entityType/entityId) ───────────
  it("super-audit-mode writes to audit_trail with entityType and entityId", async () => {
    // Directly insert using the same pattern as super-audit-mode.ts
    const testUserId = 99999903;
    const testEntityId = 42;

    await db.insert(auditTrail).values({
      userId: testUserId,
      action: "SUPER_AUDIT_VIEW_CLAIM",
      entityType: "claim",
      entityId: testEntityId,
      changeDescription: JSON.stringify({
        sessionId: 1,
        claimId: testEntityId,
        tenantId: "AUDIT01-TEST-TENANT",
        test: true,
      }),
      createdAt: new Date().toISOString(),
    });

    const row = await getLatestAuditTrail(db);
    expect(row).toBeDefined();
    expect(row.userId).toBe(testUserId);
    expect(row.action).toBe("SUPER_AUDIT_VIEW_CLAIM");
    expect(row.entityType).toBe("claim");
    expect(row.entityId).toBe(testEntityId);
    const desc_ = typeof row.changeDescription === "string"
      ? JSON.parse(row.changeDescription)
      : row.changeDescription;
    expect(desc_.test).toBe(true);
    expect(desc_.tenantId).toBe("AUDIT01-TEST-TENANT");
  });

  // ── 5. SYSTEM_USER_ID constant is correct ────────────────────────────────
  it("SYSTEM_USER_ID matches the reserved system user in the DB", async () => {
    const { users: usersTable } = await import("../drizzle/schema");
    const [systemUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, SYSTEM_USER_ID))
      .limit(1);

    expect(systemUser).toBeDefined();
    expect(systemUser.openId).toBe("SYSTEM");
    expect(systemUser.name).toBe("KINGA System");
  });

  // ── 6. integrityHash is consistent with ingestion-review-queue.ts ─────────
  it("integrityHash matches SHA-256 of JSON.stringify(payload) — same as ingestion-review-queue.ts", async () => {
    const crypto = await import("crypto");
    const testPayload = {
      tenantId: "TEST",
      userId: SYSTEM_USER_ID,
      userRole: "system",
      actionType: "update",
      resourceType: "claim",
      resourceId: "123",
      beforeState: null,
      afterState: '{"test":true}',
    };
    const expectedHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(testPayload))
      .digest("hex");

    // Insert via helper and read back
    await insertIsoAuditLog(db, {
      tenantId: "TEST",
      userId: SYSTEM_USER_ID,
      userRole: "system",
      actionType: "update",
      resourceType: "claim",
      resourceId: "123",
      beforeState: null,
      afterState: '{"test":true}',
    });

    const row = await getLatestIsoAuditLog(db);
    expect(row.integrityHash).toBe(expectedHash);
  });
});
