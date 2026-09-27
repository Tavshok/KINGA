import assert from "node:assert/strict";
import test from "node:test";

import {
  P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS,
  P0_B1_HELD_MUTATION_BOUNDARY_TARGETS,
  readP0B1ClientHoldBoundarySources,
  verifyP0B1ClientHoldBoundary,
} from "./verify-p0-b1-client-hold-boundary.mjs";

const sources = await readP0B1ClientHoldBoundarySources();
const executiveAlertsPath =
  "client/src/components/executive/ExecutiveAlertsCenter.tsx";
const claimsCorePath = "server/routers/claims-core.ts";
const policeReportPath = "client/src/components/PoliceReportForm.tsx";
const decisionReportPath = "client/src/pages/ClaimDecisionReport.page.tsx";
const riskManagerPath = "client/src/pages/RiskManagerDashboard.tsx";
const externalAssessorPath = "client/src/pages/ExternalAssessorDashboard.tsx";
const escalationCentrePath = "client/src/components/EscalationCentre.tsx";

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
  assert.equal(P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS.length, 13);
  assert.equal(P0_B1_HELD_MUTATION_BOUNDARY_TARGETS.length, 9);
});

test("rejects an Escalation Centre hold-binding bypass before array operations", () => {
  const unsafe = {
    ...sources,
    [escalationCentrePath]: sources[escalationCentrePath].replace(
      "const escalationsHold = escalationsResponse.hold;",
      "const escalationsHold = null;"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: escalationsHold is not directly bound to escalationsResponse\.hold/
  );
});

test("rejects an Escalation Centre false-reassurance branch after a hold", () => {
  const unsafe = {
    ...sources,
    [escalationCentrePath]: sources[escalationCentrePath].replace(
      "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }",
      "if (false && escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: escalationsHold does not control a P0FraudValidationHold branch/
  );
});

test("rejects Escalation Centre array processing before its terminal hold", () => {
  const unsafe = {
    ...sources,
    [escalationCentrePath]: sources[escalationCentrePath].replace(
      "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }",
      "const preHoldRows = escalationsResponse.value as any[];\n  preHoldRows.filter(row => row.fraudRiskLevel === 'critical');\n\n  if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: availableEscalations, escalationsResponse\.value, or escalationsQuery\.data cannot be processed before the terminal escalationsHold return/
  );
});

test("rejects Escalation Centre pre-hold processing hidden in an invoked callback", () => {
  const unsafe = {
    ...sources,
    [escalationCentrePath]: sources[escalationCentrePath].replace(
      "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }",
      "(() => {\n    const preHoldRows = escalationsResponse.value as any[];\n    preHoldRows.filter(row => row.fraudRiskLevel === 'critical');\n  })();\n\n  if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: availableEscalations, escalationsResponse\.value, or escalationsQuery\.data cannot be processed before the terminal escalationsHold return/
  );
});

test("rejects Escalation Centre destructured, bracketed, and aliased pre-hold values", () => {
  const holdBranch =
    "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }";
  const unsafePrefixes = [
    "const { value: preHoldRows } = escalationsResponse;\n  preHoldRows.filter(row => row.fraudRiskLevel === 'critical');\n\n",
    "const preHoldRows = escalationsResponse['value'] as any[];\n  preHoldRows.filter(row => row.fraudRiskLevel === 'critical');\n\n",
    "const preHoldResponse = escalationsResponse;\n  preHoldResponse.value.filter(row => row.fraudRiskLevel === 'critical');\n\n",
  ];

  for (const unsafePrefix of unsafePrefixes) {
    const unsafe = {
      ...sources,
      [escalationCentrePath]: sources[escalationCentrePath].replace(
        holdBranch,
        `${unsafePrefix}${holdBranch}`
      ),
    };
    assert.throws(
      () => verifyP0B1ClientHoldBoundary(unsafe),
      /EscalationCentre\.tsx: availableEscalations, escalationsResponse\.value, or escalationsQuery\.data cannot be processed before the terminal escalationsHold return/
    );
  }
});

test("rejects Escalation Centre query-option callbacks before the terminal hold", () => {
  const unsafe = {
    ...sources,
    [escalationCentrePath]: sources[escalationCentrePath].replace(
      "refetchInterval: 60000,",
      "refetchInterval: query => {\n      const held = query.state.data;\n      String(held);\n      return 60000;\n    },"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: availableEscalations, escalationsResponse\.value, or escalationsQuery\.data cannot be processed before the terminal escalationsHold return/
  );
});

test("rejects Escalation Centre inline-only hold rendering after pre-hold processing", () => {
  const directHold =
    "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  }";
  const withoutEarlyHold = sources[escalationCentrePath].replace(
    directHold,
    "const preHoldRows = availableEscalations as any[];\n  preHoldRows.filter(row => row.fraudRiskLevel === 'critical');"
  );
  const unsafe = {
    ...sources,
    [escalationCentrePath]: withoutEarlyHold.replace(
      "return (\n    <Card",
      "return escalationsHold ? <P0FraudValidationHold hold={escalationsHold} /> : (\n    <Card"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /EscalationCentre\.tsx: escalationsHold must retain a direct terminal return before any availableEscalations processing/
  );
});

test("rejects a Police Report success callback that continues after a hold", () => {
  const unsafe = {
    ...sources,
    [policeReportPath]: sources[policeReportPath].replace(
      "if (policeReportSuccessResponse.hold) {\n        return;\n      }",
      "if (policeReportSuccessResponse.hold) {\n        toast.success('Unsafe continuation');\n      }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /policeReports\.create\.useMutation must begin its direct onSuccess callback with a terminal canonical hold branch/
  );
});

test("rejects a Claim Decision Report held-render bypass", () => {
  const unsafe = {
    ...sources,
    [decisionReportPath]: sources[decisionReportPath].replace(
      "if (aiAssessmentHold) {\n    return <P0FraudValidationHold hold={aiAssessmentHold} />;\n  }",
      "if (false && aiAssessmentHold) {\n    return <P0FraudValidationHold hold={aiAssessmentHold} />;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /aiAssessmentHold does not control a P0FraudValidationHold branch/
  );
});

test("rejects a Claim Decision governance audit hold binding bypass", () => {
  const decisionReportSource = sources[decisionReportPath];
  const unsafeDecisionReportSource = decisionReportSource.replace(
    /const auditLogHold = auditLogDecisionResponse\.hold;/,
    "const auditLogHold = null;"
  );
  assert.notEqual(
    unsafeDecisionReportSource,
    decisionReportSource,
    "audit-log hold attack fixture must replace the direct hold binding"
  );
  const unsafe = {
    ...sources,
    [decisionReportPath]: unsafeDecisionReportSource,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /auditLogHold is not directly bound to auditLogDecisionResponse\.hold/
  );
});

test("rejects a Claim Decision Report hold branch appended after live output", () => {
  const liveBranch =
    "if (aiAssessmentHold) {\n    return <P0FraudValidationHold hold={aiAssessmentHold} />;\n  }";
  const unsafe = {
    ...sources,
    [decisionReportPath]: `${sources[decisionReportPath].replace(
      liveBranch,
      ""
    )}\n${liveBranch}\n`,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /must retain exactly one direct render return|does not control a P0FraudValidationHold branch/
  );
});

test("rejects a prior hold branch whose else arm returns live output", () => {
  const unsafe = {
    ...sources,
    [riskManagerPath]: sources[riskManagerPath].replace(
      "if (riskPortfolioHold) {\n    return <P0FraudValidationHold hold={riskPortfolioHold} />;\n  }",
      "if (escalationsHold) {\n    return <P0FraudValidationHold hold={escalationsHold} />;\n  } else {\n    return <div>Unsafe live workflow</div>;\n  }\n\n  if (riskPortfolioHold) {\n    return <P0FraudValidationHold hold={riskPortfolioHold} />;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /riskPortfolioHold does not control a P0FraudValidationHold branch|must retain exactly one direct render return/
  );
});

test("rejects a Claim Decision finalisation callback that continues after a hold", () => {
  const unsafe = {
    ...sources,
    [decisionReportPath]: sources[decisionReportPath].replace(
      /if \(finaliseDecisionResponse\.hold\) \{\n\s+return;\n\s+\}/,
      "if (finaliseDecisionResponse.hold) {\n          toast.success('Unsafe continuation');\n          return;\n        }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /finaliseDecision\.useMutation must begin its direct onSuccess callback with a terminal canonical hold branch/
  );
});

test("rejects a Claim Decision replay callback that continues after a hold", () => {
  const replaySource = sources[decisionReportPath];
  const unsafeReplaySource = replaySource.replace(
    /if \(replayResponse\.hold\) return;/,
    "if (replayResponse.hold) toast.success('Unsafe replay continuation');"
  );
  assert.notEqual(
    unsafeReplaySource,
    replaySource,
    "replay continuation attack fixture must replace the terminal hold branch"
  );
  const unsafe = {
    ...sources,
    [decisionReportPath]: unsafeReplaySource,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /replayDecision\.useMutation must begin its direct onSuccess callback with a terminal canonical hold branch/
  );
});

test("rejects an External Assessor action branch that remains live for a held assessment", () => {
  const externalAssessorSource = sources[externalAssessorPath];
  const unsafeExternalAssessorSource = externalAssessorSource.replace(
    /if \(fraudDecisionHold\) \{\n\s+return \(/,
    "if (fraudDecisionHold) {\n    toast.success('Unsafe action state');\n    return ("
  );
  assert.notEqual(
    unsafeExternalAssessorSource,
    externalAssessorSource,
    "External Assessor action attack fixture must replace the held action branch"
  );
  const unsafe = {
    ...sources,
    [externalAssessorPath]: unsafeExternalAssessorSource,
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /does not control a P0FraudValidationHold branch/
  );
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

test("rejects a Risk Portfolio inline hold in place of terminal workflow containment", () => {
  const unsafe = {
    ...sources,
    [riskManagerPath]: sources[riskManagerPath].replace(
      "if (riskPortfolioHold) {\n    return <P0FraudValidationHold hold={riskPortfolioHold} />;\n  }",
      "if (riskPortfolioHold) {\n    return <div>Portfolio hold</div>;\n  }"
    ),
  };

  assert.throws(
    () => verifyP0B1ClientHoldBoundary(unsafe),
    /riskPortfolioHold does not control a P0FraudValidationHold branch/
  );
});

test("rejects a nested Risk Portfolio numeric zero fallback", () => {
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
