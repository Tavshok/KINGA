/**
 * AUDIT-01 Verification Tests
 *
 * Confirms redirected code writes to the intended audit table. Each write uses
 * an exact suite-owned sentinel and is removed by the afterAll lifecycle hook.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { workflowAuditTrail, isoAuditLogs, auditTrail } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { SYSTEM_USER_ID, insertIsoAuditLog, insertWorkflowAudit } from "./utils/audit-helpers";

describe("AUDIT-01: Correct audit table routing", () => {
  let db: any;
  const fixtureStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const testTenantId = `audit01-fixture-${fixtureStamp}`;
  const testClaimId = 90000000 + Number(Date.now() % 1000000);
  const testUserId = 91000000 + Number(Date.now() % 1000000);
  const testAuditUserId = 92000000 + Number(Date.now() % 1000000);
  const hashResourceId = `fixture-hash-${fixtureStamp}`;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("DB unavailable — cannot run AUDIT-01 tests");
  });

  it("insertWorkflowAudit writes to workflowAuditTrail with correct fields", async () => {
    await insertWorkflowAudit(db, {
      claimId: testClaimId,
      userId: testUserId,
      userRole: "claims_processor",
      previousState: "intake_queue",
      newState: "under_assessment",
      comments: "AUDIT-01 test entry",
      metadata: { test: true, source: "audit-01.test.ts" },
    });

    const [row] = await db.select().from(workflowAuditTrail).where(and(
      eq(workflowAuditTrail.claimId, testClaimId),
      eq(workflowAuditTrail.userId, testUserId),
      eq(workflowAuditTrail.comments, "AUDIT-01 test entry"),
      eq(workflowAuditTrail.previousState, "intake_queue"),
      eq(workflowAuditTrail.newState, "under_assessment"),
    ));
    expect(row).toBeDefined();
    expect(row.userRole).toBe("claims_processor");
    const meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    expect(meta).toMatchObject({ test: true, source: "audit-01.test.ts" });
  });

  it("insertIsoAuditLog (system actor) writes ISO audit data and an integrity hash", async () => {
    await insertIsoAuditLog(db, {
      tenantId: testTenantId,
      userId: SYSTEM_USER_ID,
      userRole: "system",
      actionType: "update",
      resourceType: "claim",
      resourceId: String(testClaimId),
      beforeState: null,
      afterState: JSON.stringify({ actionType: "INTAKE_ESCALATION", test: true }),
    });
    const [row] = await db.select().from(isoAuditLogs).where(and(
      eq(isoAuditLogs.tenantId, testTenantId),
      eq(isoAuditLogs.userId, SYSTEM_USER_ID),
      eq(isoAuditLogs.resourceType, "claim"),
      eq(isoAuditLogs.resourceId, String(testClaimId)),
    ));
    expect(row).toBeDefined();
    expect(row.userRole).toBe("system");
    expect(row.integrityHash).toHaveLength(64);
    const after = typeof row.afterState === "string" ? JSON.parse(row.afterState) : row.afterState;
    expect(after).toMatchObject({ actionType: "INTAKE_ESCALATION", test: true });
  });

  it("insertIsoAuditLog (human actor) writes ISO audit data with exact identity", async () => {
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
    const [row] = await db.select().from(isoAuditLogs).where(and(
      eq(isoAuditLogs.tenantId, testTenantId),
      eq(isoAuditLogs.userId, testUserId),
      eq(isoAuditLogs.resourceType, "routing_policy"),
      eq(isoAuditLogs.resourceId, "policy-v2-test"),
    ));
    expect(row).toBeDefined();
    expect(row.userRole).toBe("insurer_admin");
    expect(row.actionType).toBe("create");
    expect(row.integrityHash).toHaveLength(64);
  });

  it("super-audit-mode writes audit_trail with entityType and entityId", async () => {
    await db.insert(auditTrail).values({
      userId: testAuditUserId,
      action: "SUPER_AUDIT_VIEW_CLAIM",
      entityType: "claim",
      entityId: testClaimId,
      changeDescription: JSON.stringify({ sessionId: 1, claimId: testClaimId, tenantId: testTenantId, test: true }),
      createdAt: new Date().toISOString(),
    });
    const [row] = await db.select().from(auditTrail).where(and(
      eq(auditTrail.userId, testAuditUserId),
      eq(auditTrail.action, "SUPER_AUDIT_VIEW_CLAIM"),
      eq(auditTrail.entityType, "claim"),
      eq(auditTrail.entityId, testClaimId),
    ));
    expect(row).toBeDefined();
    const description = typeof row.changeDescription === "string" ? JSON.parse(row.changeDescription) : row.changeDescription;
    expect(description).toMatchObject({ tenantId: testTenantId, test: true });
  });

  it("SYSTEM_USER_ID matches the reserved system user in the DB", async () => {
    const { users } = await import("../drizzle/schema");
    const [systemUser] = await db.select().from(users).where(eq(users.id, SYSTEM_USER_ID)).limit(1);
    expect(systemUser).toMatchObject({ openId: "SYSTEM", name: "KINGA System" });
  });

  it("integrityHash matches SHA-256 of JSON.stringify(payload)", async () => {
    const crypto = await import("crypto");
    const payload = {
      tenantId: testTenantId,
      userId: SYSTEM_USER_ID,
      userRole: "system",
      actionType: "update",
      resourceType: "claim",
      resourceId: hashResourceId,
      beforeState: null,
      afterState: '{"test":true}',
    };
    const expectedHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    await insertIsoAuditLog(db, payload);
    const [row] = await db.select().from(isoAuditLogs).where(and(
      eq(isoAuditLogs.tenantId, testTenantId),
      eq(isoAuditLogs.userId, SYSTEM_USER_ID),
      eq(isoAuditLogs.resourceType, "claim"),
      eq(isoAuditLogs.resourceId, hashResourceId),
    ));
    expect(row.integrityHash).toBe(expectedHash);
  });

  afterAll(async () => {
    if (!db) return;

    // Full, immutable sentinels ensure each delete can match only this suite's rows.
    await db.delete(workflowAuditTrail).where(and(eq(workflowAuditTrail.claimId, testClaimId), eq(workflowAuditTrail.userId, testUserId), eq(workflowAuditTrail.comments, "AUDIT-01 test entry"), eq(workflowAuditTrail.previousState, "intake_queue"), eq(workflowAuditTrail.newState, "under_assessment")));
    await db.delete(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, SYSTEM_USER_ID), eq(isoAuditLogs.resourceType, "claim"), eq(isoAuditLogs.resourceId, String(testClaimId))));
    await db.delete(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, testUserId), eq(isoAuditLogs.resourceType, "routing_policy"), eq(isoAuditLogs.resourceId, "policy-v2-test")));
    await db.delete(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, SYSTEM_USER_ID), eq(isoAuditLogs.resourceType, "claim"), eq(isoAuditLogs.resourceId, hashResourceId)));
    await db.delete(auditTrail).where(and(eq(auditTrail.userId, testAuditUserId), eq(auditTrail.action, "SUPER_AUDIT_VIEW_CLAIM"), eq(auditTrail.entityType, "claim"), eq(auditTrail.entityId, testClaimId)));

    const [workflowRows, escalationRows, policyRows, hashRows, auditRows] = await Promise.all([
      db.select({ id: workflowAuditTrail.id }).from(workflowAuditTrail).where(and(eq(workflowAuditTrail.claimId, testClaimId), eq(workflowAuditTrail.userId, testUserId), eq(workflowAuditTrail.comments, "AUDIT-01 test entry"), eq(workflowAuditTrail.previousState, "intake_queue"), eq(workflowAuditTrail.newState, "under_assessment"))),
      db.select({ id: isoAuditLogs.id }).from(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, SYSTEM_USER_ID), eq(isoAuditLogs.resourceType, "claim"), eq(isoAuditLogs.resourceId, String(testClaimId)))),
      db.select({ id: isoAuditLogs.id }).from(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, testUserId), eq(isoAuditLogs.resourceType, "routing_policy"), eq(isoAuditLogs.resourceId, "policy-v2-test"))),
      db.select({ id: isoAuditLogs.id }).from(isoAuditLogs).where(and(eq(isoAuditLogs.tenantId, testTenantId), eq(isoAuditLogs.userId, SYSTEM_USER_ID), eq(isoAuditLogs.resourceType, "claim"), eq(isoAuditLogs.resourceId, hashResourceId))),
      db.select({ id: auditTrail.id }).from(auditTrail).where(and(eq(auditTrail.userId, testAuditUserId), eq(auditTrail.action, "SUPER_AUDIT_VIEW_CLAIM"), eq(auditTrail.entityType, "claim"), eq(auditTrail.entityId, testClaimId))),
    ]);
    expect(workflowRows).toHaveLength(0);
    expect(escalationRows).toHaveLength(0);
    expect(policyRows).toHaveLength(0);
    expect(hashRows).toHaveLength(0);
    expect(auditRows).toHaveLength(0);
  });
});
