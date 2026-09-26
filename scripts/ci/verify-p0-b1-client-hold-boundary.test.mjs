import assert from "node:assert/strict";
import test from "node:test";

import {
  P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS,
  readP0B1ClientHoldBoundarySources,
  verifyP0B1ClientHoldBoundary,
} from "./verify-p0-b1-client-hold-boundary.mjs";

const sources = await readP0B1ClientHoldBoundarySources();
const executiveAlertsPath =
  "client/src/components/executive/ExecutiveAlertsCenter.tsx";
const claimsCorePath = "server/routers/claims-core.ts";

function withRiskPortfolioRawAuthority(source) {
  const start = source.indexOf(
    "getRiskPortfolioAnalytics: insurerDomainProcedure"
  );
  const holdReturn = source.indexOf(
    "return buildP0B1FraudOutputHold();",
    start
  );
  assert.notEqual(start, -1);
  assert.notEqual(holdReturn, -1);
  return `${source.slice(0, holdReturn)}const db = await getDb();\n      void db;\n      const fraudRiskScore = 0;\n      void fraudRiskScore;\n      ${source.slice(holdReturn)}`;
}

test("accepts every registered live P0-B1 hold boundary", () => {
  assert.doesNotThrow(() => verifyP0B1ClientHoldBoundary(sources));
  assert.equal(P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS.length, 4);
});

test("rejects a commented-out Executive Alerts hold binding", () => {
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: sources[executiveAlertsPath].replace(
      "const fraudDecisionHold = executiveAlertsResponse.hold;",
      "const fraudDecisionHold = null; // const fraudDecisionHold = executiveAlertsResponse.hold;"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /ExecutiveAlertsCenter\.tsx: fraudDecisionHold is not directly bound/
  );
});

test("rejects an Executive Alerts default-to-empty raw data bypass", () => {
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: sources[executiveAlertsPath].replace(
      /const alerts = fraudDecisionHold[\s\S]*?availableExecutiveAlerts\?\.alerts \?\? \[\]\);/,
      "const alerts = (data?.alerts ?? []) as AvailableExecutiveAlert[];"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /ExecutiveAlertsCenter\.tsx: alerts must derive from availableExecutiveAlerts/
  );
});

test("rejects an Executive hold binding that conditionally suppresses a real hold", () => {
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: sources[executiveAlertsPath].replace(
      "const fraudDecisionHold = executiveAlertsResponse.hold;",
      "const fraudDecisionHold = executiveAlertsResponse.hold ? null : executiveAlertsResponse.hold;"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /ExecutiveAlertsCenter\.tsx: fraudDecisionHold is not directly bound/
  );
});

test("rejects unsafe Executive Alerts bindings hidden by same-named decoys", () => {
  const unsafeLiveComponent = sources[executiveAlertsPath]
    .replace(
      "const executiveAlertsResponse = discriminateP0B1FraudDecisionResponse(data);",
      "const executiveAlertsResponse = data;"
    )
    .replace(
      "const fraudDecisionHold = executiveAlertsResponse.hold;",
      "const fraudDecisionHold = null;"
    )
    .replace(
      /const alerts = fraudDecisionHold[\s\S]*?\.alerts \?\? \[\]\);/,
      "const alerts = (data?.alerts ?? []) as AvailableExecutiveAlert[];"
    );
  const decoy = `
function p0B1GuardDecoy() {
  const data = undefined;
  const executiveAlertsResponse = discriminateP0B1FraudDecisionResponse(data);
  const fraudDecisionHold = executiveAlertsResponse.hold;
  const alerts = fraudDecisionHold ? [] : ((executiveAlertsResponse.value as { alerts?: AvailableExecutiveAlert[] } | undefined)?.alerts ?? []);
  return <>{fraudDecisionHold ? <P0FraudValidationHold hold={fraudDecisionHold} compact /> : alerts.length}</>;
}
`;
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: `${unsafeLiveComponent}${decoy}`,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /ExecutiveAlertsCenter\.tsx: executiveAlertsResponse is not directly bound|ExecutiveAlertsCenter\.tsx: fraudDecisionHold is not directly bound/
  );
});

test("rejects an Executive all-clear message that is not dominated by the hold", () => {
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: sources[executiveAlertsPath].replace(
      "{isLoading\n                ? 'Loading fraud alert status'\n                : fraudDecisionHold",
      "{true\n                ? 'No active alerts'\n                : fraudDecisionHold"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /Executive reassurance output is not dominated by the direct fraud hold branch/
  );
});

test("rejects an unreachable held-render decoy when the live held branch says all clear", () => {
  const unsafe = {
    ...sources,
    [executiveAlertsPath]: sources[executiveAlertsPath]
      .replace(
        "        ) : fraudDecisionHold ? (\n          <P0FraudValidationHold hold={fraudDecisionHold} compact />\n        ) : isError ? (",
        "        ) : fraudDecisionHold ? (\n          <div>All clear</div>\n        ) : isError ? ("
      )
      .replace(
        "      {/* Header */}",
        "      {false && [0].map(() => fraudDecisionHold ? <P0FraudValidationHold hold={fraudDecisionHold} compact /> : null)}\n      {/* Header */}"
      ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /does not control a P0FraudValidationHold branch|Executive reassurance output is not dominated by the direct fraud hold branch/
  );
});

test("rejects a nested Risk Portfolio numeric zero fallback", () => {
  const riskManagerPath = "client/src/pages/RiskManagerDashboard.tsx";
  const unsafe = {
    ...sources,
    [riskManagerPath]: sources[riskManagerPath].replace(
      "`${riskAnalytics.kpis.fraudRate}%`",
      "`${riskAnalytics?.kpis?.fraudRate ?? 0}%`"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /Risk Portfolio KPI retains a raw numeric zero fallback/
  );
});

test("rejects a Risk Portfolio raw database read even if adjacent route names change", () => {
  const unsafe = {
    ...sources,
    [claimsCorePath]: withRiskPortfolioRawAuthority(
      sources[claimsCorePath]
    ).replace(
      "getFraudRuleAccuracy: insurerDomainProcedure",
      "renamedAdjacentRoute: insurerDomainProcedure"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /Risk Portfolio hold route retains raw authority access: getDb\.|Risk Portfolio hold route retains raw authority access: fraudRiskScore\./
  );
});

test("rejects a decoy Risk Portfolio property before the exported claimsRouter", () => {
  const decoy = `
const p0B1GuardDecoy = {
  getRiskPortfolioAnalytics: insurerDomainProcedure.query(async () => {
    return buildP0B1FraudOutputHold();
  }),
};
`;
  const unsafe = {
    ...sources,
    [claimsCorePath]: `${decoy}${withRiskPortfolioRawAuthority(sources[claimsCorePath])}`,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /Risk Portfolio hold route retains raw authority access: getDb\.|Risk Portfolio hold route retains raw authority access: fraudRiskScore\./
  );
});

test("rejects a direct Risk Portfolio callback with nested query decoys and raw access", () => {
  const unsafe = {
    ...sources,
    [claimsCorePath]: withRiskPortfolioRawAuthority(
      sources[claimsCorePath]
    ).replace(
      "void input;\n      // P0-B1:",
      "void input;\n      const p0B1NestedDecoy = insurerDomainProcedure.query(async () => {\n        return buildP0B1FraudOutputHold();\n      });\n      void p0B1NestedDecoy;\n      // P0-B1:"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /Risk Portfolio hold route retains raw authority access: getDb\.|Risk Portfolio hold route retains raw authority access: fraudRiskScore\./
  );
});

test("fails closed when the registered Risk Portfolio route cannot be resolved", () => {
  const unsafe = {
    ...sources,
    [claimsCorePath]: sources[claimsCorePath].replace(
      "getRiskPortfolioAnalytics: insurerDomainProcedure",
      "getRiskPortfolioAnalyticsRenamed: insurerDomainProcedure"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /getRiskPortfolioAnalytics callback is missing or structurally unresolvable inside exported claimsRouter/
  );
});
