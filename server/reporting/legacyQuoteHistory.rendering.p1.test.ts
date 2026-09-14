import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  end: vi.fn(async () => undefined),
  createConnection: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({ default: { createConnection: mocks.createConnection } }));

const { generateClaimsIntelligenceReport } = await import("./claimsIntelligenceReport");
const { generateForensicDecisionReport } = await import("./forensicDecisionReport");
const { generateReportHtml } = await import("./reportDefinitions");

const claim = {
  id: 9911, tenant_id: "tenant-legacy", claim_reference: "KNG-LEGACY-9911", status: "submitted", workflow_state: "intake",
  vehicle_make: "Toyota", vehicle_model: "Corolla", vehicle_year: 2023, vehicle_registration: "LEG-9911", vehicle_registry_id: 77,
  incident_date: "2026-08-14", incident_location: "Harare", incident_type: "collision", incident_description: "No-write legacy quote fixture.", created_at: "2026-08-14T08:00:00Z",
};

const legacyQuotes = [
  { id: 1, quoted_amount: 125000, currency_code: "USD", currency: "USD", quote_type: "original", status: "submitted", panel_beater_name: "Alpha" },
  { id: 2, quoted_amount: 135000, currency_code: "USD", currency: "USD", quote_type: "revised", parent_quote_id: 1, status: "submitted", panel_beater_name: "Alpha" },
  { id: 3, quoted_amount: 140000, currency_code: "USD", currency: "USD", quote_type: "original", status: "submitted", panel_beater_name: "Beta" },
];

function installLegacyHistoryConnection() {
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM claims c")) return [[claim], []];
    if (sql.includes("FROM panel_beater_quotes")) return [legacyQuotes, []];
    return [[], []];
  });
  mocks.createConnection.mockResolvedValue({ execute: mocks.execute, end: mocks.end });
}

describe("AUD-P1-001 executed legacy-history report surfaces", () => {
  beforeEach(() => { vi.clearAllMocks(); installLegacyHistoryConnection(); });

  it("renders identical shared legacy evidence, without an active comparison matrix, across CL, CI, and FR", async () => {
    const [ci, fr, cl] = await Promise.all([
      generateClaimsIntelligenceReport(9911, "tenant-legacy"),
      generateForensicDecisionReport(9911, "tenant-legacy"),
      generateReportHtml("claim.assessment", { claimId: 9911 }, "tenant-legacy"),
    ]);
    const sharedSections = [cl, ci, fr].map((html) => html.match(/<section data-shared-quote-evidence="legacy-history-only"[\s\S]*?<\/section>/)?.[0]);
    for (const section of sharedSections) {
      expect(section).toContain("Historical quotation evidence — not a comparison.");
      expect(section).toContain("Alpha");
      expect(section).toContain("$1,350.00");
      expect(section).not.toContain('data-shared-quote-evidence-matrix="active"');
    }
    expect(sharedSections[0]).toBe(sharedSections[1]);
    expect(sharedSections[1]).toBe(sharedSections[2]);
  });

  it("renders an identical shared active canonical quotation section across CL, CI, and FR", async () => {
    const activeClaim = {
      ...claim,
      id: 9912,
      cost_intelligence_json: JSON.stringify({ compositeOptimisation: {
        canonicalQuoteLedger: [
          { quoteId: 11, panelBeater: "Active Alpha", totalCostUsd: 1000, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
          { quoteId: 12, panelBeater: "Active Beta", totalCostUsd: 1200, currency: "USD", status: "active", evidenceEligibility: "final_l2_eligible" },
        ],
        l1SubmittedCostUsd: 1000, l2CompositeOptimisedCostUsd: 950, isComplete: true, sourceQuotesReceived: 2,
      }}),
    };
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM claims c")) return [[activeClaim], []];
      if (sql.includes("FROM panel_beater_quotes")) return [[
        { id: 11, quoted_amount: 100000, currency_code: "USD", status: "submitted", panel_beater_name: "Active Alpha" },
        { id: 12, quoted_amount: 120000, currency_code: "USD", status: "submitted", panel_beater_name: "Active Beta" },
      ], []];
      return [[], []];
    });
    mocks.createConnection.mockResolvedValue({ execute: mocks.execute, end: mocks.end });

    const [ci, fr, cl] = await Promise.all([
      generateClaimsIntelligenceReport(9912, "tenant-legacy"),
      generateForensicDecisionReport(9912, "tenant-legacy"),
      generateReportHtml("claim.assessment", { claimId: 9912 }, "tenant-legacy"),
    ]);
    const sections = [cl, ci, fr].map((html) => html.match(/<section data-shared-quote-evidence="active-comparison"[\s\S]*?<\/section>/)?.[0]);
    for (const section of sections) {
      expect(section).toContain("Active Alpha");
      expect(section).toContain("Active Beta");
      expect(section).toContain("$1,000.00");
      expect(section).toContain("$950.00");
    }
    expect(sections[0]).toBe(sections[1]);
    expect(sections[1]).toBe(sections[2]);
  });

  it("renders an identical neutral Vehicle Passport evidence section across CL, CI, and FR", async () => {
    const preLossCondition = {
      request_number: "VP-9911",
      snapshot_version: "4",
      snapshot_date: "2026-07-01",
      exterior_condition: "Good",
      interior_condition: "Fair",
      mechanical_condition: "Good",
      odometer_km: 123456,
      existing_damage_notes: "Minor pre-loss scratch",
    };
    mocks.execute.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM claims c")) return [[claim], []];
      if (sql.includes("vehicle_condition_snapshots")) return [[preLossCondition], []];
      if (sql.includes("FROM panel_beater_quotes")) return [legacyQuotes, []];
      return [[], []];
    });
    mocks.createConnection.mockResolvedValue({ execute: mocks.execute, end: mocks.end });

    const [ci, fr, cl] = await Promise.all([
      generateClaimsIntelligenceReport(9911, "tenant-legacy"),
      generateForensicDecisionReport(9911, "tenant-legacy"),
      generateReportHtml("claim.assessment", { claimId: 9911 }, "tenant-legacy"),
    ]);
    const sections = [cl, ci, fr].map((html) => html.match(/<section class="evidence-panel vehicle-passport-evidence"[\s\S]*?<\/section>/)?.[0]);
    for (const section of sections) {
      expect(section).toContain('data-vehicle-passport-evidence="pre-loss"');
      expect(section).toContain("VP-9911 · v4");
      expect(section).toContain("Minor pre-loss scratch");
      expect(section).toContain("Dated source evidence");
    }
    expect(sections[0]).toBe(sections[1]);
    expect(sections[1]).toBe(sections[2]);
  });
});
