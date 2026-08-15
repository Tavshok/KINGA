import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

function sourceSlice(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing source range: ${start}`);
  return source.slice(from, to);
}

describe("AUD-P0-002 assessor assignment authority — no-write contract", () => {
  it("derives evaluation identity and tenant scope from the authenticated assigned assessor", () => {
    const router = read("server/routers.ts");
    const submit = sourceSlice(router, "// Submit evaluation", "// Get evaluation by claim");

    expect(submit).toContain("const actorTenantId = ctx.user.tenantId");
    expect(submit).toContain("getClaimById(input.claimId, actorTenantId)");
    expect(submit).toContain("claim.assignedAssessorId !== ctx.user.id");
    expect(submit).toContain("assessorId: ctx.user.id");
    expect(submit).toContain("tenantId: claim.tenantId");
    expect(submit).not.toContain("assessorId: input.assessorId,");
    expect(submit.indexOf("getClaimById(input.claimId, actorTenantId)")).toBeLessThan(
      submit.indexOf("createAssessorEvaluation({"),
    );
  });

  it("records durable in-app assignment history and makes email an optional delivery channel", () => {
    const schema = read("drizzle/schema.ts");
    const db = read("server/db.ts");
    const claimsRouter = read("server/routers/claims-core.ts");

    expect(schema).toContain('export const claimAssignments = mysqlTable("claim_assignments"');
    for (const field of ["assignedByUserId", "assignmentSource", "inAppNotificationCreated", "emailNotificationRequested", "emailNotificationReference", "parentAssignmentId"]) {
      expect(schema).toContain(field);
    }
    expect(db).toContain("Authoritative in-app assessor assignment");
    expect(db).toContain("status: \"reassigned\"");
    expect(claimsRouter).toContain("emailNotificationRequested: z.boolean().optional().default(false)");
    expect(claimsRouter).toContain("if (input.emailNotificationRequested && claim && assessor)");
    expect(claimsRouter).toContain("markClaimAssignmentNotification(assignmentId, { inAppCreated: true })");
  });
});
