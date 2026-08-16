import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "server/routers/photo-reextraction.ts"), "utf8");

describe("photo re-extraction tenant authority", () => {
  it("requires a session tenant and validates assessment claim scope before jobs or cached classification", () => {
    expect(source).toContain("function requirePhotoReextractionTenant");
    expect(source).toContain("async function requirePhotoAssessmentScope");
    expect(source).toContain("await requirePhotoAssessmentScope(db, tenantId, input.assessmentId, input.claimId);");
    expect(source).toContain("await requirePhotoAssessmentScope(scopedDb, tenantId, assessmentId);");
    expect(source).toContain("assessmentId: z.number().int().positive(),");
  });

  it("keeps tenant predicates on job polling latest results and assessment cache writes", () => {
    expect(source).toContain("WHERE j.id = ? AND c.tenant_id = ? LIMIT 1");
    expect(source).toContain("await requirePhotoAssessmentScope(db, tenantId, input.assessmentId);");
    expect(source).toContain("WHERE id = ? AND tenant_id = ?");
    expect(source).toContain("persistClassificationCache(db, assessmentId, tenantId");
  });
});
