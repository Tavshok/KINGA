import React from "react";
import { KingaClaimsReport } from "@/components/KingaClaimsReport";

/**
 * The actual standard-report section rendered by ClaimDecisionReport.
 * Kept separate so claimant/professional disclosure assertions exercise the
 * same route composition without loading unrelated legacy report panels.
 */
export function ClaimDecisionReportStandardView({
  claim,
  aiAssessment,
  enforcement,
  quotes,
  audience,
}: {
  claim: any;
  aiAssessment: any;
  enforcement: any;
  quotes: any[];
  audience: "client" | "professional";
}) {
  return (
    <div data-report-view="standard">
      <KingaClaimsReport
        claim={claim}
        aiAssessment={aiAssessment}
        enforcement={enforcement}
        quotes={quotes}
        audience={audience}
      />
    </div>
  );
}
