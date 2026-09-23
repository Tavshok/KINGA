import React from "react";

import {
  P0FraudValidationHold,
  normalizeP0FraudValidationHold,
} from "@/components/ValidationGate";

type GlobalSearchClaim = {
  id: number | string;
  claimNumber?: string | null;
  kingaRef?: string | null;
  claimantName?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  status?: string | null;
  estimatedClaimValue?: string | number | null;
};

type GlobalSearchPayload = {
  status?: unknown;
  claims?: unknown;
  results?: unknown;
  explanation?: unknown;
  requiredEvidence?: unknown;
  resolver?: unknown;
};

function globalSearchClaims(
  payload: GlobalSearchPayload | null | undefined
): GlobalSearchClaim[] {
  const candidate = Array.isArray(payload?.claims)
    ? payload.claims
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  return candidate.filter(
    (claim): claim is GlobalSearchClaim =>
      !!claim && typeof claim === "object" && "id" in claim
  );
}

/**
 * A legacy fraud-status string is not a publishable fraud conclusion under
 * P0-B1. The search list preserves an operational review state instead.
 */
export function displayP0B1GlobalSearchStatus(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "unknown";
  return /fraud/i.test(value) ? "manual_review" : value;
}

function formatCurrency(value: unknown, currencySymbol: string): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric)
    ? `${currencySymbol} ${numeric.toLocaleString()}`
    : "—";
}

export function P0B1GlobalSearchResults({
  payload,
  currencySymbol,
  onClaimSelect,
}: {
  payload: GlobalSearchPayload | null | undefined;
  currencySymbol: string;
  onClaimSelect: (claimId: number | string) => void;
}) {
  const claims = globalSearchClaims(payload);
  const hold =
    payload?.status === "FRAUD_DECISION_WITHHELD"
      ? normalizeP0FraudValidationHold(payload)
      : null;

  return (
    <div>
      {hold && (
        <div
          style={{ padding: "12px 16px", borderBottom: "1px solid #E7E2D6" }}
        >
          <P0FraudValidationHold hold={hold} />
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Claim ID", "Claimant", "Vehicle", "Status", "Value"].map(
              header => (
                <th
                  key={header}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#9AA293",
                    borderBottom: "1px solid #E7E2D6",
                    background: "#F7F8F6",
                  }}
                >
                  {header}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {claims.length > 0 ? (
            claims.slice(0, 4).map(claim => {
              const status = displayP0B1GlobalSearchStatus(claim.status);
              const vehicle = [
                claim.vehicleRegistration,
                claim.vehicleMake,
                claim.vehicleModel,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <tr
                  key={claim.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => onClaimSelect(claim.id)}
                >
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12.5px",
                      borderBottom: "1px solid #E7E2D6",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#1C5C39",
                      fontWeight: 500,
                    }}
                  >
                    {claim.kingaRef ||
                      claim.claimNumber ||
                      `KGA-${String(claim.id).padStart(7, "0")}`}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12.5px",
                      borderBottom: "1px solid #E7E2D6",
                      color: "#15201A",
                    }}
                  >
                    {claim.claimantName || "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12px",
                      borderBottom: "1px solid #E7E2D6",
                      color: "#6B7568",
                    }}
                  >
                    {vehicle || "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12.5px",
                      borderBottom: "1px solid #E7E2D6",
                    }}
                  >
                    <span
                      style={{
                        background: "#E7F1EA",
                        color: "#1C5C39",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        fontSize: "10px",
                        fontWeight: 600,
                      }}
                    >
                      {status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      fontSize: "12.5px",
                      borderBottom: "1px solid #E7E2D6",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCurrency(claim.estimatedClaimValue, currencySymbol)}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: "24px 12px",
                  textAlign: "center",
                  fontSize: "13px",
                  color: "#9AA293",
                }}
              >
                Use the search box above to find claims
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
