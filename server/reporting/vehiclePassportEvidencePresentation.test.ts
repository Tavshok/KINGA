import { describe, expect, it } from "vitest";
import { renderVehiclePassportEvidencePanel } from "./vehiclePassportEvidencePresentation";

const escapeHtml = (value: unknown) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

describe("Vehicle Passport evidence presentation", () => {
  it("renders a neutral, source-bound pre-loss snapshot without treating it as a decision", () => {
    const html = renderVehiclePassportEvidencePanel({
      snapshot: {
        requestNumber: "VP-<2026>",
        snapshotVersion: 3,
        snapshotDate: "2026-02-01",
        exteriorCondition: "Good",
        interiorCondition: "Fair",
        mechanicalCondition: "Good",
        odometerKm: 123456,
        existingDamageNotes: "Scratch & dent",
      },
      formatDate: (value) => `DATE:${String(value)}`,
      escapeHtml,
    });

    expect(html).toContain('data-vehicle-passport-evidence="pre-loss"');
    expect(html).toContain("Dated source evidence");
    expect(html).toContain("VP-&lt;2026&gt; · v3");
    expect(html).toContain("Scratch &amp; dent");
    expect(html).toContain("does not determine causation, repair cost, policy, premium, settlement, fraud conclusion, or claim outcome.");
    expect(html).not.toContain("KINGA Optimised");
  });

  it("accepts the legacy stored field shape for display compatibility and emits nothing without a snapshot", () => {
    const html = renderVehiclePassportEvidencePanel({
      snapshot: {
        request_number: "VP-LEGACY",
        snapshot_version: "2",
        snapshot_date: "2025-11-01",
        exterior_condition: "Fair",
        interior_condition: "Fair",
        mechanical_condition: "Unknown",
        odometer_km: 90000,
      },
      formatDate: String,
      escapeHtml,
    });

    expect(html).toContain("VP-LEGACY · v2");
    expect(html).toContain("90,000 km");
    expect(renderVehiclePassportEvidencePanel({ snapshot: null, formatDate: String, escapeHtml })).toBe("");
  });
});
