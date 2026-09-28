import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  end: vi.fn(async () => undefined),
  createConnection: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: mocks.createConnection,
  },
}));

const { generateClaimsIntelligenceReport } = await import(
  "./claimsIntelligenceReport"
);
const { generateForensicDecisionReport } = await import(
  "./forensicDecisionReport"
);
const { generateReportHtml } = await import("./reportDefinitions");
const { generateVehicleVerificationReport } = await import(
  "./vehicleVerificationReport"
);

function claimFor(status: string) {
  return {
    id: 8801,
    tenant_id: "tenant-lifecycle",
    claim_reference: "KNG-LIFECYCLE-8801",
    status,
    workflow_state: "intake",
    vehicle_make: "Toyota",
    vehicle_model: "Corolla",
    vehicle_year: 2023,
    vehicle_registration: "LIF-8801",
    incident_date: "2026-08-14",
    incident_location: "Harare",
    incident_type: "collision",
    incident_description: "No-write readiness rendering fixture.",
    created_at: "2026-08-14T08:00:00Z",
  };
}

function installNoWriteConnection(status: string) {
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM claims c")) return [[claimFor(status)], []];
    return [[], []];
  });
  mocks.createConnection.mockResolvedValue({
    execute: mocks.execute,
    end: mocks.end,
  });
}

describe("P0 no-write rendered report readiness consumer matrix", () => {
  it("retains non-fraud claim content while replacing fraud fields with one actionable abstention marker", async () => {
    vi.clearAllMocks();
    installNoWriteConnection("assessment_complete");

    const [assessment, intelligence, forensic] = await Promise.all([
      generateReportHtml(
        "claim.assessment",
        { claimId: 8801 },
        "tenant-lifecycle"
      ),
      generateClaimsIntelligenceReport(8801, "tenant-lifecycle"),
      generateForensicDecisionReport(8801, "tenant-lifecycle"),
    ]);

    for (const html of [assessment, intelligence, forensic]) {
      expect(html).toContain('data-p0-fraud-decision="withheld"');
      expect(html).toContain(
        "Fraud Decision Withheld — Manual Review Required"
      );
      expect(html).toContain("What is missing:");
      expect(html).toContain("What resolves this:");
      expect(html).toContain("Toyota");
      expect(html).not.toContain("Fraud Score —");
    }
  });

  it("requires a tenant scope and redacts fraud fields in vehicle verification without losing vehicle history", async () => {
    vi.clearAllMocks();
    installNoWriteConnection("assessment_complete");

    await expect(
      generateVehicleVerificationReport({ registration: "LIF-8801" })
    ).rejects.toThrow("Tenant scope is required");

    const html = await generateVehicleVerificationReport(
      { registration: "LIF-8801" },
      "tenant-lifecycle"
    );
    expect(html).toContain('data-p0-fraud-decision="withheld"');
    expect(html).toContain("LIF-8801");
    expect(html).toContain("Tenant-Scoped Claim History");
    expect(html).not.toContain("Fraud Score");
    expect(html).not.toContain("Risk Score");
  });

  it.each([
    ["assessment_start_failed", "assessment_start_recoverable_failure"],
    ["intake_pending", "assessment_pending"],
    ["document_processing_failed", "assessment_unavailable"],
  ] as const)(
    "qualifies %s across CL, CI, and FR without presenting completed assessment intelligence",
    async (status, readinessState) => {
      vi.clearAllMocks();
      installNoWriteConnection(status);

      const ci = await generateClaimsIntelligenceReport(
        8801,
        "tenant-lifecycle"
      );
      const fr = await generateForensicDecisionReport(8801, "tenant-lifecycle");
      const cl = await generateReportHtml(
        "claim.assessment",
        { claimId: 8801 },
        "tenant-lifecycle"
      );

      for (const html of [cl, ci, fr]) {
        expect(html).toContain(
          `data-kinga-report-readiness="${readinessState}"`
        );
        expect(html).toContain("assessment intelligence");
        expect(html).not.toContain(
          'data-kinga-report-readiness="ready_for_report_inputs"'
        );
      }
      // CI resolves one canonical record, FR resolves a canonical record plus its
      // forensic model, and CL uses one report-scoped connection.
      expect(mocks.end).toHaveBeenCalledTimes(4);
    }
  );
});
