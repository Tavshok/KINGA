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

describe("AUD assessor report evidence-authority and routing audit — no-write", () => {
  it("classifies the external assessment upload as an unlinked analysis utility, not an assessor report submission", () => {
    const router = read("server/routers.ts");
    const upload = sourceSlice(router, "uploadExternalAssessment: protectedProcedure", "// Export assessment report as PDF");

    expect(upload).toContain("fileName: z.string()");
    expect(upload).toContain("fileData: z.string()");
    expect(upload).not.toContain("claimId:");
    expect(upload).not.toContain("assessorId:");
    expect(upload).not.toContain("createAssessorEvaluation");
    expect(upload).not.toContain("emitClaimEvent");
  });

  it("classifies direct evaluation submission as unsupported by report provenance, attestation, or claims-review routing", () => {
    const router = read("server/routers.ts");
    const submit = sourceSlice(router, "// Submit evaluation", "// Get evaluation by claim");

    expect(submit).toContain("assessorId: z.number()");
    expect(submit).toContain("createAssessorEvaluation({");
    expect(submit).toContain("status: \"submitted\"");
    expect(submit).toContain('updateClaimStatus(input.claimId, "quotes_pending"');
    expect(submit).not.toContain("toState: \"internal_review\"");
    expect(submit).not.toContain("ctx.user.id !== input.assessorId");
    expect(submit).not.toContain("sourceReport");
    expect(submit).not.toContain("attest");
    expect(submit).not.toContain("claims_assessor");
    expect(submit).not.toContain("claims_manager");
    expect(submit).not.toContain("reviewQueue");
  });

  it("classifies the summary schema and current Claims Manager consumer as unlinked to an accepted assessor report", () => {
    const schema = read("drizzle/schema.ts");
    const evaluationSchema = sourceSlice(schema, "export const assessorEvaluations", "export const assessorInsurerRelationships");
    const view = read("client/src/pages/ClaimsManagerComparisonView.tsx");

    expect(evaluationSchema).toContain("status: mysqlEnum(['pending','in_progress','completed','submitted'])");
    for (const absentField of ["sourceDocumentId", "sourceReportId", "attestedBy", "attestedAt", "reviewedBy", "reviewedAt", "reviewDecision", "version"]) {
      expect(evaluationSchema).not.toContain(absentField);
    }
    expect(view).toContain("trpc.assessorEvaluations.byClaim.useQuery({ claimId })");
    expect(view).toContain("assessorEval?.estimatedRepairCost");
    expect(view).not.toContain("accepted assessor report");
  });

  it("classifies ingestion assessor-report evidence as separate from claim-bound assessor evaluation authority", () => {
    const schema = read("drizzle/schema.ts");
    const ingestion = sourceSlice(schema, "export const ingestionDocuments", "export const insuranceAuditLogs");

    expect(ingestion).toContain("'assessor_report'");
    expect(ingestion).toContain("validationStatus");
    expect(ingestion).not.toContain("claimId:");
    expect(ingestion).not.toContain("assessorEvaluationId");
  });
});
