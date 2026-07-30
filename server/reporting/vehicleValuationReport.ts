/**
 * T8: Vehicle Valuation Report
 *
 * Produced for agency users. Presents KINGA's AI-driven vehicle valuation
 * for a specific make/model/year, including market data, claims-based
 * comparables, condition adjustments, and confidence score.
 *
 * Access: agency role only (enforced in REPORT_ACCESS in reportDefinitions.ts).
 * Design: black / white / grey palette, KINGA design system.
 */

import {
  buildKingaHtml, esc, fmtUSD, fmtD, chip, callout,
} from "./templates/kingaDesignSystem";
import {
  generateVehicleValuation,
  VehicleValuationRequest,
} from "../insurance/valuation-engine";

export async function generateVehicleValuationReport(
  params: Record<string, unknown>
): Promise<string> {
  const make  = String(params.make  ?? "").trim();
  const model = String(params.model ?? "").trim();
  const year  = Number(params.year  ?? 0);
  const registrationNumber = params.registrationNumber ? String(params.registrationNumber) : undefined;
  const condition = (params.condition as VehicleValuationRequest["condition"]) ?? "good";
  const mileage   = params.mileage ? Number(params.mileage) : undefined;
  const valuationDate = params.valuationDate ? new Date(String(params.valuationDate)) : new Date();

  if (!make || !model || !year) {
    throw new Error("make, model, and year are required for a vehicle valuation report");
  }

  const request: VehicleValuationRequest = {
    make, model, year, registrationNumber, condition, mileage, valuationDate,
  };

  const result = await generateVehicleValuation(request);

  const reportDate = valuationDate.toLocaleDateString("en-ZA", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const estimatedValueZar = (result.estimatedValue / 100).toLocaleString("en-ZA", {
    style: "currency", currency: "ZAR", minimumFractionDigits: 0,
  });

  const confidenceChip = result.confidence >= 75
    ? chip(`${result.confidence}% CONFIDENCE`, "pass")
    : result.confidence >= 50
      ? chip(`${result.confidence}% CONFIDENCE`, "warn")
      : chip(`${result.confidence}% CONFIDENCE`, "fail");

  const conditionLabel = condition.charAt(0).toUpperCase() + condition.slice(1);

  const comparablesRows = result.comparables.slice(0, 10).map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${c.vehicleYear}</td>
      <td>${(c.estimatedValue / 100).toLocaleString("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 0 })}</td>
      <td>${fmtD(c.date instanceof Date ? c.date.toISOString() : String(c.date))}</td>
    </tr>`).join("");

    const factorData = [
    { label: "Base Value",           amount: result.factors.baseValue / 100 },
    { label: "Condition Adjustment", amount: result.factors.conditionAdjustment / 100 },
    { label: "Age Adjustment",       amount: result.factors.ageAdjustment / 100 },
    { label: "Market Demand",        amount: result.factors.marketDemand / 100 },
  ];
    const factorRows = `<table class="kinga-table"><tbody>${factorData.map(f =>
    `<tr><th>${esc(f.label)}</th><td>ZAR ${f.amount.toLocaleString("en-ZA", { minimumFractionDigits: 0 })}</td></tr>`
  ).join("")}</tbody></table>`;

  const body = `
    <div class="kinga-section">
      <div class="kinga-section-header">Valuation Summary</div>
      <table class="kinga-table">
        <tbody>
          <tr>
            <th>Vehicle</th>
            <td><strong>${esc(year)} ${esc(make)} ${esc(model)}</strong></td>
            <th>Estimated Market Value</th>
            <td><strong style="font-size:1.15em">${estimatedValueZar}</strong></td>
          </tr>
          <tr>
            <th>Condition</th>
            <td>${esc(conditionLabel)}</td>
            <th>Confidence</th>
            <td>${confidenceChip}</td>
          </tr>
          <tr>
            <th>Mileage</th>
            <td>${mileage != null ? `${mileage.toLocaleString()} km` : "Not provided"}</td>
            <th>Valuation Source</th>
            <td>${esc(result.source)}</td>
          </tr>
          ${registrationNumber ? `<tr><th>Registration</th><td colspan="3">${esc(registrationNumber)}</td></tr>` : ""}
        </tbody>
      </table>
    </div>

    <div class="kinga-section">
      <div class="kinga-section-header">Value Factors</div>
      ${factorRows}
    </div>

    ${result.comparables.length > 0 ? `
    <div class="kinga-section">
      <div class="kinga-section-header">Comparable Claims (${result.comparables.length} data point${result.comparables.length !== 1 ? "s" : ""})</div>
      <table class="kinga-table">
        <thead>
          <tr><th>#</th><th>Vehicle Year</th><th>Estimated Value</th><th>Claim Date</th></tr>
        </thead>
        <tbody>${comparablesRows}</tbody>
      </table>
    </div>` : callout(
      "No comparable claims found in KINGA database for this vehicle. " +
      "Valuation is based on statistical estimation only.",
      "amber"
    )}

    ${result.confidence < 50 ? callout(
      `<strong>Low Confidence:</strong> This valuation has a confidence score of ${result.confidence}%. ` +
      `Insufficient market data is available for this vehicle. Consider requesting a manual assessor valuation.`,
      "amber"
    ) : ""}
  `;

  const reportTitle = `Vehicle Valuation Report — ${year} ${make} ${model}`;
  const headerHtml = `
    <div class="kinga-header">
      <div class="kinga-header-title">${esc(reportTitle)}</div>
      <div class="kinga-header-meta">Valuation Date: ${esc(reportDate)} &nbsp;|&nbsp; Generated by KINGA AutoVerify AI</div>
    </div>
  `;

  return buildKingaHtml(reportTitle, headerHtml + body);
}
