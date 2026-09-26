import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  assessmentByClaim: vi.fn(),
  queue: vi.fn(),
  assignments: vi.fn(),
  appointments: vi.fn(),
  performance: vi.fn(),
  trend: vi.fn(),
  authorizePayment: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    claims: {
      byStatus: { useQuery: mocks.queue },
      myAssignments: { useQuery: mocks.assignments },
      authorizePayment: { useMutation: mocks.authorizePayment },
    },
    appointments: {
      myAppointments: { useQuery: mocks.appointments },
    },
    assessors: {
      getPerformanceDashboard: { useQuery: mocks.performance },
      getMyPerformanceTrend: { useQuery: mocks.trend },
    },
    aiAssessments: {
      byClaim: { useQuery: mocks.assessmentByClaim },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useSearch: () => "",
}));

vi.mock("@/components/NotificationsInbox", () => ({
  NotificationsInbox: () => null,
  NotificationsTabBadge: () => null,
}));

vi.mock("@/components/ReportsBadgeWidget", () => ({
  default: () => null,
}));

import InternalAssessorDashboard from "../client/src/pages/InternalAssessorDashboard";

describe("P0-B1 B-R2 held action runtime containment", () => {
  beforeEach(() => {
    mocks.queue.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });
    mocks.assignments.mockReturnValue({
      data: [],
      isLoading: false,
      refetch: vi.fn(),
    });
    mocks.appointments.mockReturnValue({ data: [], isLoading: false });
    mocks.performance.mockReturnValue({ data: undefined, isLoading: false });
    mocks.trend.mockReturnValue({ data: undefined, isLoading: false });
    mocks.authorizePayment.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
  });

  it("terminally withholds Internal Assessor workflow actions when expanded context is held", () => {
    mocks.assessmentByClaim.mockReturnValue({
      data: buildP0B1FraudDecisionHold({ scope: "internal_assessor_context" }),
      isLoading: false,
    });

    const html = renderToStaticMarkup(
      React.createElement(InternalAssessorDashboard)
    );

    expect(html).toContain("Fraud Decision Withheld");
    expect(html).toContain("Manual Review Required");
    expect(html).not.toContain("Claims assigned to you");
    expect(html).not.toContain("Authorise Payment");
  });
});
