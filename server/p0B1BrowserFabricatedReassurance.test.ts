import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  passportById: vi.fn(),
  passportByRegistration: vi.fn(),
  passportFraudSignals: vi.fn(),
  passportTimeline: vi.fn(),
  executiveAlerts: vi.fn(),
  assessmentByClaim: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    vehiclePassport: {
      getPassport: { useQuery: mocks.passportById },
      getPassportByRegistration: { useQuery: mocks.passportByRegistration },
      getFraudSignals: { useQuery: mocks.passportFraudSignals },
      getTimeline: { useQuery: mocks.passportTimeline },
    },
    analytics: {
      getExecutiveAlerts: { useQuery: mocks.executiveAlerts },
    },
    aiAssessments: {
      byClaim: { useQuery: mocks.assessmentByClaim },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: () => null,
}));

vi.mock("@/components/NotificationsInbox", () => ({
  NotificationsInbox: () => null,
}));

vi.mock("@/components/ReportsBadgeWidget", () => ({
  default: () => null,
}));

import { VehiclePassportPanel } from "../client/src/components/VehiclePassportPanel";
import { ExecutiveAlertsCenter } from "../client/src/components/executive/ExecutiveAlertsCenter";
import { ExpandableClaimRow } from "../client/src/pages/ExternalAssessorDashboard";

const manualReviewHold = buildP0B1FraudDecisionHold();

const claim = {
  id: 72,
  claimNumber: "P0B1-R1-72",
  vehicleMake: "Toyota",
  vehicleModel: "Corolla",
  vehicleYear: 2022,
  status: "under_review",
  createdAt: "2026-09-26T00:00:00.000Z",
  incidentDate: "2026-09-25",
  incidentDescription: "Front-end collision",
};

function expectVehicleFraudPresentationWithheld(html: string) {
  expect(html).toContain("Fraud Decision Withheld");
  expect(html).toContain("Manual Review Required");
  expect(html).not.toContain("No fraud signals detected");
  expect(html).not.toContain("LOW RISK");
  expect(html).not.toContain("Repeat Zone Claims");
  expect(html).not.toContain("Fraud Alerts");
  expect(html).not.toContain("Renewal Risk Score");
  expect(html).not.toContain("P0B1-TIMELINE-FRAUD-ALERT");
  expect(html).not.toMatch(/>fraud alert</i);
  expect(html).toContain("P0B1-TIMELINE-INSPECTION");
  expect(html).toContain("Total Claims");
}

describe("P0-B1 fabricated-reassurance browser containment", () => {
  beforeEach(() => {
    mocks.passportById.mockReset();
    mocks.passportByRegistration.mockReset();
    mocks.passportFraudSignals.mockReset();
    mocks.passportTimeline.mockReset();
    mocks.executiveAlerts.mockReset();
    mocks.assessmentByClaim.mockReset();

    mocks.passportById.mockReturnValue({
      data: {
        dataVersion: "1",
        generatedAt: "2026-09-26T00:00:00.000Z",
        intelligence: {
          totalClaims: 1,
          repeatZoneCount: 0,
          fraudAlertCount: 0,
          avgConfidenceScore: 88,
          totalSettlementCents: 0,
          lastClaimDate: null,
          riskLevel: "low",
        },
        renewalRisk: {
          scoreValue: 0,
          scoreLabel: "very_low",
          confidenceLevel: 60,
          factors: { fraudSignalDensity: 0 },
        },
      },
      isLoading: false,
      error: null,
    });
    mocks.passportByRegistration.mockReturnValue({ data: undefined });
    mocks.passportTimeline.mockReturnValue({
      data: {
        events: [
          {
            eventType: "fraud_alert",
            eventDate: "2026-09-26T00:00:00.000Z",
            description:
              "Fraud Alert: P0B1-TIMELINE-FRAUD-ALERT — high severity",
            sourceTable: "fraud_alerts",
          },
          {
            eventType: "inspection",
            eventDate: "2026-09-25T00:00:00.000Z",
            description: "Inspection: P0B1-TIMELINE-INSPECTION — complete",
            sourceTable: "inspections",
          },
        ],
      },
    });
  });

  it("renders the canonical direct hold instead of a no-fraud Vehicle Passport outcome", () => {
    mocks.passportFraudSignals.mockReturnValue({ data: manualReviewHold });

    const html = renderToStaticMarkup(
      React.createElement(VehiclePassportPanel, { vehicleRegistryId: 72 })
    );

    expectVehicleFraudPresentationWithheld(html);
  });

  for (const [state, query] of [
    ["is pending", { data: undefined, isLoading: true, isError: false }],
    ["fails", { data: undefined, isLoading: false, isError: true }],
  ] as const) {
    it(`withholds Vehicle Passport fraud presentation while the authority query ${state}`, () => {
      mocks.passportFraudSignals.mockReturnValue(query);

      const html = renderToStaticMarkup(
        React.createElement(VehiclePassportPanel, { vehicleRegistryId: 72 })
      );

      expectVehicleFraudPresentationWithheld(html);
    });
  }

  it("renders unavailable executive alerts instead of the all-clear empty state after a held query rejection", () => {
    mocks.executiveAlerts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      React.createElement(ExecutiveAlertsCenter)
    );

    expect(html).toContain("Fraud alerts unavailable");
    expect(html).toContain("manual review");
    expect(html).not.toContain("All clear");
    expect(html).not.toContain("No alerts at this time");
  });

  it("renders the nested assessment hold instead of green styling for a withheld fraud score", () => {
    mocks.assessmentByClaim.mockReturnValue({
      data: {
        id: 72,
        claimId: 72,
        createdAt: "2026-09-26T00:00:00.000Z",
        fraudDecision: manualReviewHold,
        suppressedFields: ["fraudScore"],
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(ExpandableClaimRow, {
        claim,
        initialExpanded: true,
      })
    );

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).not.toContain("Fraud Score");
    expect(html).not.toContain("—/100");
  });
});
