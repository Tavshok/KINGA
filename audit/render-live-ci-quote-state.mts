import { generateClaimsIntelligenceReport } from "../server/reporting/claimsIntelligenceReport";

const html = await generateClaimsIntelligenceReport(12909902, "tenant-1771335377063");
const assertions = {
  preservesVisibleSubmittedAmounts: html.includes("The Dent Doctor") && html.includes("Dynamic Africa Trading"),
  labelsLegacyHistory: html.includes("Legacy submitted history — not active comparison evidence"),
  hasNoFalseZeroHighestQuote: !html.includes("Highest submitted quote</td><td class=\"v\">$0.00"),
  qualifiesAbsentActiveMetric: html.includes("Highest active submitted quote</td><td class=\"v\">Not available — no active comparison quote"),
  suppressesActiveMarketLabel: !html.includes("Active market quote"),
};

console.log(JSON.stringify(assertions, null, 2));
process.exit(Object.values(assertions).some((value) => !value) ? 1 : 0);
