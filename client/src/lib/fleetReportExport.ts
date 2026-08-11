type FleetSummary = {
  totalClaims: number;
  openClaims: number;
  totalCostCents: number;
  averageCostCents: number;
  highRiskVehicleCount: number;
  highRiskDriverCount: number;
};

type VehicleInsight = {
  registrationNumber: string | null;
  vehicle: string;
  year: number | null;
  claimCount: number;
  openClaimCount: number;
  totalCostCents: number;
  highRisk: boolean;
  elevatedFrequency: boolean;
  riskScore: number | null;
};

type DriverInsight = {
  name: string;
  email: string | null;
  claimCount: number;
  openClaimCount: number;
  totalCostCents: number;
  elevatedFrequency: boolean;
};

type PeriodInsight = { period: string; claimCount: number; totalCostCents: number };

export type FleetClaimsReportData = {
  periodDays: 30 | 90 | 365;
  summary: FleetSummary;
  vehicleInsights: VehicleInsight[];
  driverInsights: DriverInsight[];
  timeSeries: PeriodInsight[];
};

const escapeHtml = (value: unknown) => String(value ?? "—")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const periodLabel = (days: 30 | 90 | 365) => days === 365 ? "Last 12 months" : `Last ${days} days`;

/**
 * Opens a print-ready report using the live Fleet manager intelligence already
 * shown in the portal. The browser print dialog lets the manager save a PDF
 * without duplicating Fleet analytics or exposing tenant data through a new URL.
 */
export function exportFleetClaimsSummaryToPdf(
  data: FleetClaimsReportData,
  formatCurrency: (amountCents: number) => string,
): boolean {
  const reportWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!reportWindow) return false;

  const vehicleRows = data.vehicleInsights.length
    ? data.vehicleInsights.map((vehicle) => `<tr>
      <td><strong>${escapeHtml(vehicle.registrationNumber)}</strong><br><span>${escapeHtml(vehicle.vehicle)} · ${escapeHtml(vehicle.year)}</span></td>
      <td>${vehicle.claimCount}</td><td>${vehicle.openClaimCount}</td><td>${escapeHtml(formatCurrency(vehicle.totalCostCents))}</td>
      <td><span class="${vehicle.highRisk ? "risk" : "ok"}">${escapeHtml(vehicle.highRisk ? (vehicle.elevatedFrequency ? "Elevated frequency" : `${vehicle.riskScore ?? 0}/100 risk`) : "Within threshold")}</span></td>
    </tr>`).join("")
    : `<tr><td colspan="5" class="empty">No fleet-linked claims were recorded for this period.</td></tr>`;

  const driverRows = data.driverInsights.length
    ? data.driverInsights.map((driver) => `<tr>
      <td><strong>${escapeHtml(driver.name)}</strong><br><span>${escapeHtml(driver.email ?? "")}</span></td>
      <td>${driver.claimCount}</td><td>${driver.openClaimCount}</td><td>${escapeHtml(formatCurrency(driver.totalCostCents))}</td>
      <td><span class="${driver.elevatedFrequency ? "risk" : "ok"}">${driver.elevatedFrequency ? "Elevated frequency" : "Within threshold"}</span></td>
    </tr>`).join("")
    : `<tr><td colspan="5" class="empty">No active driver claims were recorded for this period.</td></tr>`;

  const periodRows = data.timeSeries.length
    ? data.timeSeries.map((period) => `<tr><td>${escapeHtml(period.period)}</td><td>${period.claimCount}</td><td>${escapeHtml(formatCurrency(period.totalCostCents))}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">No cost trend is available for this period.</td></tr>`;

  reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8" />
    <title>KINGA Fleet Claims Summary — ${escapeHtml(periodLabel(data.periodDays))}</title>
    <style>
      @page { size: A4; margin: 14mm; } * { box-sizing: border-box; }
      body { margin: 0; color: #17372B; font: 11px Arial, sans-serif; } h1,h2,p { margin: 0; }
      header { border-bottom: 3px solid #1C5C39; padding-bottom: 14px; margin-bottom: 18px; }
      .eyebrow { color: #6D816F; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      h1 { font-size: 24px; margin: 5px 0; } .sub { color: #536A5D; }
      .kpis { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin: 14px 0 20px; }
      .kpi { border: 1px solid #D9E5DA; border-top:3px solid #1C5C39; padding:9px; } .kpi b { display:block; color:#687A6E; font-size:8px; letter-spacing:.06em; text-transform:uppercase; margin-bottom:4px; } .kpi span { font-size:16px; font-weight:700; }
      h2 { margin: 20px 0 8px; font-size: 14px; } table { width:100%; border-collapse:collapse; margin-bottom:14px; } th { background:#EAF2EB; color:#315642; font-size:8px; letter-spacing:.05em; text-align:left; text-transform:uppercase; } th,td { border:1px solid #D9E5DA; padding:7px; vertical-align:top; } td span { color:#687A6E; font-size:9px; }
      .risk,.ok { border-radius:10px; display:inline-block; font-size:8px; font-weight:700; padding:3px 6px; } .risk { background:#FCE7E7; color:#9D2727; } .ok { background:#E8F4EA; color:#176A36; } .empty { color:#687A6E; text-align:center; padding:14px; }
      footer { border-top:1px solid #D9E5DA; color:#687A6E; font-size:8px; margin-top:20px; padding-top:8px; } @media print { .no-print { display:none; } }
    </style></head><body>
      <header><div class="eyebrow">KINGA · Risk Intelligence Platform</div><h1>Fleet Claims Summary</h1><p class="sub">${escapeHtml(periodLabel(data.periodDays))} · Generated ${escapeHtml(new Date().toLocaleString())}</p></header>
      <section class="kpis">
        <div class="kpi"><b>Total claims</b><span>${data.summary.totalClaims}</span></div><div class="kpi"><b>Open claims</b><span>${data.summary.openClaims}</span></div>
        <div class="kpi"><b>Cost exposure</b><span>${escapeHtml(formatCurrency(data.summary.totalCostCents))}</span></div><div class="kpi"><b>Average claim</b><span>${escapeHtml(formatCurrency(data.summary.averageCostCents))}</span></div>
      </section>
      <h2>Vehicle claim exposure</h2><table><thead><tr><th>Vehicle</th><th>Claims</th><th>Open</th><th>Cost</th><th>Risk signal</th></tr></thead><tbody>${vehicleRows}</tbody></table>
      <h2>Driver claim signals</h2><table><thead><tr><th>Driver</th><th>Claims</th><th>Open</th><th>Cost</th><th>Signal</th></tr></thead><tbody>${driverRows}</tbody></table>
      <h2>Cost by period</h2><table><thead><tr><th>Month</th><th>Claims</th><th>Cost</th></tr></thead><tbody>${periodRows}</tbody></table>
      <footer>Prepared by KINGA Risk Intelligence Platform · This summary is based on fleet-linked claims within the selected period.</footer>
      <script>window.addEventListener('load', () => window.print());<\/script></body></html>`);
  reportWindow.document.close();
  return true;
}
