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
  it("derives report identity and tenant scope from the authenticated accepted assessor before authoritative evaluation projection", () => {
    const router = read("server/routers.ts");
    const directSummary = sourceSlice(router, "// Legacy direct summary submission", "// Get evaluation by claim");
    const createDraft = sourceSlice(router, "createDraft: protectedProcedure", "attest: protectedProcedure");

    expect(directSummary).toContain("PRECONDITION_FAILED");
    expect(createDraft).toContain("const tenantId = ctx.user.tenantId");
    expect(createDraft).toContain("getClaimById(input.claimId, tenantId)");
    expect(createDraft).toContain("claim.assignedAssessorId !== ctx.user.id");
    expect(createDraft).toContain("getAcceptedClaimAssessorAssignment");
    expect(createDraft).toContain("assessorUserId: ctx.user.id");
    expect(createDraft).toContain("tenantId,");
    expect(createDraft.indexOf("getClaimById(input.claimId, tenantId)")).toBeLessThan(
      createDraft.indexOf("createAssessorReportDraft({"),
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
