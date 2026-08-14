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
  vehicle_make: "Toyota", vehicle_model: "Corolla", vehicle_year: 2023, vehicle_registration: "LEG-9911",
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

  it("renders persisted supersession and unknown legacy rows as qualified history across CL, CI, and FR", async () => {
    const [ci, fr, cl] = await Promise.all([
      generateClaimsIntelligenceReport(9911, "tenant-legacy"),
      generateForensicDecisionReport(9911, "tenant-legacy"),
      generateReportHtml("claim.assessment", { claimId: 9911 }, "tenant-legacy"),
    ]);
    for (const html of [cl, ci, fr]) {
      expect(html).toContain("Legacy quotation history");
      expect(html).toContain("not active comparison evidence");
      expect(html).toContain("Alpha: $1,350.00");
      expect(html).not.toContain("Alpha: $1,250.00");
    }
  });
});
