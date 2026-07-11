/**
 * Test: roleAssignmentAudit fleet/platform enum fix
 *
 * Verifies that the four previously-missing enum values
 * (fleet_admin, fleet_manager, fleet_driver, platform_super_admin)
 * can now be written to and read back from role_assignment_audit
 * without a DB enum violation.
 *
 * Requires a live DATABASE_URL — skipped automatically in unit-only CI.
 */

import { describe, it, expect, afterAll } from "vitest";
import { getDb } from "./db";
import { roleAssignmentAudit, users } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const TEST_TENANT = "test-fleet-platform-enum-tenant";

// We insert directly (bypassing logRoleAssignment's tenant-isolation check
// which requires real users) to isolate the enum column behaviour.
const CASES = [
  { previousRole: "user" as const,        newRole: "fleet_manager" as const,       label: "fleet_manager upgrade" },
  { previousRole: "fleet_manager" as const, newRole: "fleet_admin" as const,        label: "fleet_admin upgrade" },
  { previousRole: "user" as const,        newRole: "fleet_driver" as const,         label: "fleet_driver grant" },
  { previousRole: "user" as const,        newRole: "platform_super_admin" as const, label: "platform_super_admin grant" },
];

// Sentinel changedByUserId that won't collide with real data
const SENTINEL_ACTOR = 999_999_991;
const SENTINEL_USER  = 999_999_992;

describe("roleAssignmentAudit — fleet/platform enum fix", () => {
  const insertedIds: number[] = [];

  afterAll(async () => {
    // Clean up test rows
    if (insertedIds.length === 0) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(roleAssignmentAudit)
      .where(inArray(roleAssignmentAudit.id, insertedIds));
  });

  for (const tc of CASES) {
    it(`can insert and read back: ${tc.label}`, async () => {
      const db = await getDb();
      if (!db) {
        console.warn("No DB — skipping live test");
        return;
      }

      // Insert the audit row directly
      const result = await db.insert(roleAssignmentAudit).values({
        tenantId: TEST_TENANT,
        userId: SENTINEL_USER,
        previousRole: tc.previousRole,
        newRole: tc.newRole,
        changedByUserId: SENTINEL_ACTOR,
        justification: `Automated enum-fix test: ${tc.label}`,
      });

      const insertId = Number(result[0].insertId);
      insertedIds.push(insertId);
      expect(insertId).toBeGreaterThan(0);

      // Read it back and verify the values survived the round-trip
      const [row] = await db
        .select()
        .from(roleAssignmentAudit)
        .where(eq(roleAssignmentAudit.id, insertId))
        .limit(1);

      expect(row).toBeDefined();
      expect(row.newRole).toBe(tc.newRole);
      expect(row.previousRole).toBe(tc.previousRole);
      expect(row.tenantId).toBe(TEST_TENANT);
    });
  }
});
