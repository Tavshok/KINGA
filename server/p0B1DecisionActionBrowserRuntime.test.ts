import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getAdjusterSignOff: vi.fn(),
  triggerAiAssessment: vi.fn(),
  byClaim: vi.fn(),
  getEnforcement: vi.fn(),
  getSnapshots: vi.fn(),
  getLatestSnapshot: vi.fn(),
  getLifecycle: vi.fn(),
  getAuditLog: vi.fn(),
  getWithLineItems: vi.fn(),
  saveSnapshot: vi.fn(),
  markReviewed: vi.fn(),
  finaliseDecision: vi.fn(),
  lockDecision: vi.fn(),
  replayDecision: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    claims: {
      getById: { useQuery: mocks.getById },
      getAdjusterSignOff: { useQuery: mocks.getAdjusterSignOff },
      triggerAiAssessment: { useMutation: mocks.triggerAiAssessment },
    },
    aiAssessments: {
      byClaim: { useQuery: mocks.byClaim },
      getEnforcement: { useQuery: mocks.getEnforcement },
      getSnapshots: { useQuery: mocks.getSnapshots },
      getLatestSnapshot: { useQuery: mocks.getLatestSnapshot },
      getLifecycle: { useQuery: mocks.getLifecycle },
      getAuditLog: { useQuery: mocks.getAuditLog },
      saveSnapshot: { useMutation: mocks.saveSnapshot },
      markReviewed: { useMutation: mocks.markReviewed },
      finaliseDecision: { useMutation: mocks.finaliseDecision },
      lockDecision: { useMutation: mocks.lockDecision },
      replayDecision: { useMutation: mocks.replayDecision },
    },
    quotes: {
      getWithLineItems: { useQuery: mocks.getWithLineItems },
    },
    useUtils: () => ({
      aiAssessments: { byClaim: { invalidate: vi.fn() } },
      claims: { getById: { invalidate: vi.fn() } },
    }),
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "insurer" } }),
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "101" }],
  useLocation: () => ["/insurer/claims/101/verdict", vi.fn()],
  useSearch: () => "",
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
  },
}));

let ClaimDecisionReport: React.ComponentType;

const hold = buildP0B1FraudDecisionHold({ scope: "B-T1 runtime proof" });

const emptyMutation = () => ({
  data: undefined,
  isPending: false,
  mutate: vi.fn(),
});

function query(data: unknown = undefined) {
  return {
    data,
    isLoading: false,
    refetch: vi.fn(),
  };
}

const legacyWorkflowSentinels = [
  "B-T1-LEGACY-CLAIM-WORKFLOW",
  "B-T1-LEGACY-ASSESSMENT-WORKFLOW",
  "B-T1-LEGACY-ENFORCEMENT-WORKFLOW",
  "B-T1-LEGACY-QUOTE-WORKFLOW",
] as const;

function setDecisionReportHooks({
  queryHold,
  mutationHold,
}: {
  queryHold?: "latestSnapshot" | "lifecycle" | "auditLog" | "snapshotHistory";
  mutationHold?:
    | "saveSnapshot"
    | "markReviewed"
    | "finaliseDecision"
    | "lockDecision"
    | "replayDecision";
} = {}) {
  const onSuccess = new Map<string, (data: unknown) => unknown>();
  const refetches = {
    lifecycle: vi.fn(),
    auditLog: vi.fn(),
  };
  mocks.getById.mockReturnValue(
    query({
      id: 101,
      currencyCode: "USD",
      claimNumber: legacyWorkflowSentinels[0],
    })
  );
  mocks.getAdjusterSignOff.mockReturnValue(query());
  mocks.triggerAiAssessment.mockReturnValue(emptyMutation());
  mocks.byClaim.mockReturnValue(
    query({
      id: 101,
      claimId: 101,
      recommendation: legacyWorkflowSentinels[1],
    })
  );
  mocks.getEnforcement.mockReturnValue(
    query({ verdict: legacyWorkflowSentinels[2] })
  );
  mocks.getWithLineItems.mockReturnValue(
    query([{ description: legacyWorkflowSentinels[3] }])
  );
  mocks.getSnapshots.mockReturnValue(
    query(queryHold === "snapshotHistory" ? hold : [])
  );
  mocks.getLatestSnapshot.mockReturnValue(
    query(queryHold === "latestSnapshot" ? hold : null)
  );
  mocks.getLifecycle.mockReturnValue({
    data:
      queryHold === "lifecycle"
        ? hold
        : { lifecycle_state: "DRAFT", is_final: false, is_locked: false },
    isLoading: false,
    refetch: refetches.lifecycle,
  });
  mocks.getAuditLog.mockReturnValue({
    data: queryHold === "auditLog" ? hold : [],
    isLoading: false,
    refetch: refetches.auditLog,
  });

  const mutationResult = (name: string) =>
    name === mutationHold
      ? { ...emptyMutation(), data: hold }
      : emptyMutation();
  for (const [name, hook] of [
    ["saveSnapshot", mocks.saveSnapshot],
    ["markReviewed", mocks.markReviewed],
    ["finaliseDecision", mocks.finaliseDecision],
    ["lockDecision", mocks.lockDecision],
    ["replayDecision", mocks.replayDecision],
  ] as const) {
    hook.mockImplementation(
      (options?: { onSuccess?: (data: unknown) => unknown }) => {
        if (options?.onSuccess) onSuccess.set(name, options.onSuccess);
        return mutationResult(name);
      }
    );
  }
  return { onSuccess, refetches };
}

function expectTerminalHold(html: string) {
  expect(html).toContain("Fraud Decision Withheld");
  expect(html).toContain("Manual Review Required");
  expect(html).not.toContain("Decision Snapshot History");
  expect(html).not.toContain("Run Replay");
  expect(html).not.toContain("Finalise Decision");
  for (const sentinel of legacyWorkflowSentinels) {
    expect(html).not.toContain(sentinel);
  }
}

describe("P0-B1 B-T1 Decision Report browser runtime containment", () => {
  beforeAll(async () => {
    (globalThis as typeof globalThis & { React: typeof React }).React = React;
    ({ default: ClaimDecisionReport } = await import(
      "../client/src/pages/ClaimDecisionReport.page"
    ));
  });

  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  for (const queryHold of [
    "latestSnapshot",
    "lifecycle",
    "auditLog",
    "snapshotHistory",
  ] as const) {
    it(`terminally renders the canonical hold when ${queryHold} is withheld`, () => {
      setDecisionReportHooks({ queryHold });

      const html = renderToStaticMarkup(
        React.createElement(ClaimDecisionReport)
      );

      expectTerminalHold(html);
    });
  }

  for (const mutationHold of [
    "saveSnapshot",
    "markReviewed",
    "finaliseDecision",
    "lockDecision",
    "replayDecision",
  ] as const) {
    it(`terminally renders the canonical hold when ${mutationHold} returns a held action result`, () => {
      setDecisionReportHooks({ mutationHold });

      const html = renderToStaticMarkup(
        React.createElement(ClaimDecisionReport)
      );

      expectTerminalHold(html);
    });
  }

  it("does not create success notification output while a held mutation state is rendered", () => {
    setDecisionReportHooks({ mutationHold: "finaliseDecision" });

    renderToStaticMarkup(React.createElement(ClaimDecisionReport));

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });

  it("executes every Decision Report success callback as a no-op for a held mutation response", () => {
    const { onSuccess, refetches } = setDecisionReportHooks({
      queryHold: "latestSnapshot",
    });
    renderToStaticMarkup(React.createElement(ClaimDecisionReport));

    for (const mutation of [
      "saveSnapshot",
      "markReviewed",
      "finaliseDecision",
      "lockDecision",
      "replayDecision",
    ]) {
      const callback = onSuccess.get(mutation);
      expect(callback, mutation).toBeTypeOf("function");
      callback?.(hold);
    }

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
    expect(refetches.lifecycle).not.toHaveBeenCalled();
    expect(refetches.auditLog).not.toHaveBeenCalled();
  });
});
