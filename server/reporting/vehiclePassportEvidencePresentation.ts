/**
 * Neutral display-only rendering for dated Vehicle Passport evidence.
 *
 * This module does not load, derive, rank, or validate vehicle data. It accepts
 * an already-resolved pre-loss snapshot and makes the evidence boundary explicit
 * wherever a claim report chooses to show it.
 */

export interface VehiclePassportEvidencePresentationInput {
  snapshot: unknown;
  formatDate: (value: unknown) => string;
  escapeHtml: (value: unknown) => string;
}

type SnapshotRecord = Record<string, unknown>;

function recordFrom(snapshot: unknown): SnapshotRecord | null {
  return snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as SnapshotRecord
    : null;
}

function text(record: SnapshotRecord, camelCase: string, snakeCase: string): string | null {
  const value = record[camelCase] ?? record[snakeCase];
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return String(value);
}

function formattedOdometer(value: string | null): string | null {
  if (value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value;
}

/**
 * Renders the same source-boundary panel in CL, CI, and FR. Both resolved
 * camel-case and legacy snake-case snapshot shapes are accepted solely for
 * display compatibility; no new value is inferred when a field is absent.
 */
export function renderVehiclePassportEvidencePanel({
  snapshot,
  formatDate,
  escapeHtml,
}: VehiclePassportEvidencePresentationInput): string {
  const source = recordFrom(snapshot);
  if (source === null) return "";

  const requestNumber = text(source, "requestNumber", "request_number") ?? "—";
  const snapshotVersion = text(source, "snapshotVersion", "snapshot_version") ?? "1";
  const snapshotDate = source.snapshotDate ?? source.snapshot_date ?? null;
  const exterior = text(source, "exteriorCondition", "exterior_condition") ?? "—";
  const interior = text(source, "interiorCondition", "interior_condition") ?? "—";
  const mechanical = text(source, "mechanicalCondition", "mechanical_condition") ?? "—";
  const odometer = formattedOdometer(text(source, "odometerKm", "odometer_km"));
  const existingDamage = text(source, "existingDamageNotes", "existing_damage_notes");

  return `
<section class="evidence-panel vehicle-passport-evidence" data-vehicle-passport-evidence="pre-loss">
  <div class="vehicle-passport-evidence-heading">
    <h4>Vehicle Passport — Pre-Loss Condition Evidence</h4>
    <span>Dated source evidence</span>
  </div>
  <table class="kv vehicle-passport-evidence-table">
    <tbody>
      <tr><td class="k">Valuation snapshot</td><td class="v">${escapeHtml(requestNumber)} · v${escapeHtml(snapshotVersion)}</td></tr>
      <tr><td class="k">Snapshot date</td><td class="v">${escapeHtml(formatDate(snapshotDate))}</td></tr>
      <tr><td class="k">Recorded condition</td><td class="v">Exterior ${escapeHtml(exterior)} · Interior ${escapeHtml(interior)} · Mechanical ${escapeHtml(mechanical)}</td></tr>
      ${odometer === null ? "" : `<tr><td class="k">Odometer then</td><td class="v">${escapeHtml(odometer)} km</td></tr>`}
      ${existingDamage === null ? "" : `<tr><td class="k">Pre-existing condition noted</td><td class="v">${escapeHtml(existingDamage)}</td></tr>`}
    </tbody>
  </table>
  <p class="evidence-boundary">Dated pre-loss valuation evidence only. It does not determine causation, repair cost, policy, premium, settlement, fraud conclusion, or claim outcome.</p>
</section>`;
}
