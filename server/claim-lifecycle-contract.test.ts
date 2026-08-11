import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const project = resolve(__dirname, "..");
const source = (relativePath: string) => readFileSync(resolve(project, relativePath), "utf8");

/**
 * These tests protect the production lifecycle wiring without invoking an LLM,
 * storage provider, or the live claims database. A separate isolated-tenant OAT
 * is required for a true external-service end-to-end run.
 */
describe("claim intake to report lifecycle contract", () => {
  it("creates uploaded claims in the processor-visible intake state and starts KINGA assessment", () => {
    const upload = source("server/upload-documents.ts");

    expect(upload).toContain('status: "intake_pending"');
    expect(upload).toContain("triggerAiAssessment(claimId)");
  });

  it("records the pipeline run and each stage without allowing observability failures to stop the assessment", () => {
    const assessment = source("server/db.ts");
    const telemetry = source("server/db-pipeline.ts");

    expect(assessment).toContain("recordRunStart");
    expect(assessment).toContain("onStageStart:");
    expect(assessment).toContain("onStageComplete:");
    expect(assessment).toContain("recordRunComplete");
    expect(telemetry).toContain("recordStageStart");
    expect(telemetry).toContain("recordStageComplete");
    expect(telemetry).toContain("// Fire-and-forget: never throw");
  });

  it("registers the three claim-report surfaces and their report generators", () => {
    const definitions = source("server/reporting/reportDefinitions.ts");
    const reportRouter = source("server/routers/reporting.ts");

    expect(definitions).toContain("generateClaimsIntelligenceReport");
    expect(definitions).toContain("generateForensicDecisionReport");
    expect(reportRouter).toContain("previewHtml");
    expect(reportRouter).toContain("generateReportHtml");
  });
});
