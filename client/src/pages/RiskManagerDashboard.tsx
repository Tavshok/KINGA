/**
 * PURPOSE: Render Risk Manager from the server-side P0-B1 operational projection.
 * PRIMARY CALLERS: Insurer risk_manager dashboard route.
 * NEVER: Request, render, or decide from raw fraud scores, levels, or flags.
 */

import { trpc } from "@/lib/trpc";
import { P0FraudValidationHold } from "@/components/ValidationGate";
import {
  discriminateP0B1FraudDecisionResponse,
  getP0B1FraudDecisionHold,
} from "@shared/p0FraudDecisionHoldPresentation";

const HIGH_VALUE_THRESHOLD = 50_000;

function formatCost(claim: {
  approvedAmount?: string | number | null;
  estimatedClaimValue?: string | number | null;
  currencyCode?: string | null;
}) {
  const value = Number(claim.approvedAmount ?? claim.estimatedClaimValue ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: claim.currencyCode || "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * The operational query is server-projected and role/tenant-gated. The legacy
 * fraud queries remain intentionally absent: a hold-safe query beside a raw
 * parallel query is not containment.
 */
export default function RiskManagerDashboard() {
  const operationalClaimsQuery =
    trpc.claims.getRiskManagerOperationalClaims.useQuery(undefined);
  const operationalClaimsResponse = discriminateP0B1FraudDecisionResponse(
    operationalClaimsQuery.data
  );
  const operationalClaimsHold = operationalClaimsResponse.hold;
  const operationalClaims = operationalClaimsResponse.value ?? [];

  // A malformed or unexpected withheld projection must still terminally stop
  // the dashboard instead of becoming an empty/green risk presentation.
  const embeddedHold = getP0B1FraudDecisionHold(operationalClaimsQuery.data);
  const terminalHold = operationalClaimsHold ?? embeddedHold;
  if (terminalHold) {
    return <P0FraudValidationHold hold={terminalHold} />;
  }

  const highValueClaims = operationalClaims.filter(
    claim =>
      Number(claim.approvedAmount ?? claim.estimatedClaimValue ?? 0) >=
      HIGH_VALUE_THRESHOLD
  );
  const operationalReviewClaims = operationalClaims.filter(
    claim =>
      claim.workflowState === "disputed" ||
      claim.workflowState === "manual_review"
  );

  return (
    <main className="min-h-screen bg-muted/20 p-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-medium text-muted-foreground">
            KINGA · Risk Manager
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Operational Claims Oversight
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This view contains independently supported claim and workflow
            information only. Automated fraud conclusions require the separate
            qualified-evidence manual-review process.
          </p>
        </header>

        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-sm text-muted-foreground">Active claims</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {operationalClaimsQuery.isLoading
                ? "…"
                : operationalClaims.length}
            </dd>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-sm text-muted-foreground">
              Operational review
            </dt>
            <dd className="mt-1 text-2xl font-semibold">
              {operationalClaimsQuery.isLoading
                ? "…"
                : operationalReviewClaims.length}
            </dd>
          </div>
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-sm text-muted-foreground">High-value claims</dt>
            <dd className="mt-1 text-2xl font-semibold">
              {operationalClaimsQuery.isLoading ? "…" : highValueClaims.length}
            </dd>
          </div>
        </dl>

        <section className="rounded-lg border bg-background">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Active operational claims</h2>
            <p className="text-sm text-muted-foreground">
              Claim routing, fraud classification, and fraud publication are not
              available in this view.
            </p>
          </div>
          {operationalClaimsQuery.isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading claims…</p>
          ) : operationalClaims.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              No active operational claims match this view.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Claim</th>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Workflow status</th>
                    <th className="px-4 py-3 text-right font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {operationalClaims.map(claim => (
                    <tr key={claim.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {claim.claimNumber ?? `Claim #${claim.id}`}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[
                          claim.vehicleRegistration,
                          claim.vehicleMake,
                          claim.vehicleModel,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {(claim.workflowState ?? claim.status ?? "pending")
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, value => value.toUpperCase())}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCost(claim)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {claim.createdAt
                          ? new Date(claim.createdAt).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
