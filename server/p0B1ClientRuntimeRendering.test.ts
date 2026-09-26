import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  replayResults: vi.fn(),
  replayStatistics: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    claimReplay: {
      getAllReplayResults: { useQuery: mocks.replayResults },
      getReplayStatistics: { useQuery: mocks.replayStatistics },
    },
  },
}));

vi.mock("@/hooks/useTenantCurrency", () => ({
  useTenantCurrency: () => ({ fmt: (value: number) => String(value) }),
}));

import { ReplayResultsTable } from "../client/src/components/replay/ReplayResultsTable";
import { ReplayStatisticsCards } from "../client/src/components/replay/ReplayStatisticsCards";

describe("P0-B1 Group A replay held-response rendering", () => {
  beforeEach(() => {
    mocks.replayResults.mockReset();
    mocks.replayStatistics.mockReset();
  });

  for (const shape of [
    buildP0B1FraudDecisionHold({ scope: "replay_results" }),
    { fraudDecision: buildP0B1FraudDecisionHold({ scope: "replay_results" }) },
  ]) {
    it("renders the canonical hold instead of executing replay result operations", () => {
      mocks.replayResults.mockReturnValue({ data: shape, isLoading: false });

      const html = renderToStaticMarkup(
        React.createElement(ReplayResultsTable)
      );

      expect(html).toContain("Replay Results Withheld");
      expect(html).toContain("manual review");
      expect(html).not.toContain("Replay Results Unavailable");
    });

    it("renders the canonical hold instead of executing replay statistic operations", () => {
      mocks.replayStatistics.mockReturnValue({ data: shape, isLoading: false });

      const html = renderToStaticMarkup(
        React.createElement(ReplayStatisticsCards)
      );

      expect(html).toContain("Replay Statistics Withheld");
      expect(html).toContain("manual review");
      expect(html).not.toContain("Replay Statistics Unavailable");
    });
  }

  it("does not classify an ordinary legacy-shaped response as a hold", () => {
    mocks.replayResults.mockReturnValue({
      data: { total: 7, status: "available" },
      isLoading: false,
    });

    const html = renderToStaticMarkup(React.createElement(ReplayResultsTable));

    expect(html).toContain("Replay Results Unavailable");
    expect(html).not.toContain("Replay Results Withheld");
  });
});
