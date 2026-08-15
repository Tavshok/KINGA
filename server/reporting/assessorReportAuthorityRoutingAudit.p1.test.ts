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

  it("retires direct evaluation summaries and requires the attested report review lifecycle", () => {
    const router = read("server/routers.ts");
    const submit = sourceSlice(router, "// Legacy direct summary submission", "// Get evaluation by claim");

    expect(submit).toContain("assessorId: z.number()");
    expect(submit).toContain("PRECONDITION_FAILED");
    expect(submit).toContain("direct evaluation summaries are not authoritative");
    expect(router).toContain("assessorReports: router");
    expect(router).toContain("attestAssessorReport");
    expect(router).toContain("submitAssessorReportForReview");
    expect(router).toContain("decideAssessorReportReview");
  });

  it("links the evaluation projection to accepted report and review records before Claims Manager consumption", () => {
    const schema = read("drizzle/schema.ts");
    const evaluationSchema = sourceSlice(schema, "export const assessorEvaluations", "export const assessorInsurerRelationships");
    const router = read("server/routers.ts");
    const view = read("client/src/pages/ClaimsManagerComparisonView.tsx");

    expect(evaluationSchema).toContain("status: mysqlEnum(['pending','in_progress','completed','submitted'])");
    expect(evaluationSchema).toContain("sourceReportId");
    expect(evaluationSchema).toContain("sourceReportVersion");
    expect(evaluationSchema).toContain("acceptedReviewId");
    expect(router).toContain("getLatestAcceptedAssessorEvaluation");
    expect(view).toContain("trpc.assessorEvaluations.byClaim.useQuery({ claimId })");
    expect(view).toContain("assessorEval?.estimatedRepairCost");
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
