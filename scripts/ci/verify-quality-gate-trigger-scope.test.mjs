import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedTriggerBlock,
  verifyQualityGateStackedTypecheckRouting,
  verifyQualityGateTriggerScope,
} from "./verify-quality-gate-trigger-scope.mjs";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/kinga-quality-gate.yml", import.meta.url)
);
const workflow = await readFile(workflowPath, "utf8");

test("accepts exactly the approved Quality Gate trigger block", () => {
  assert.deepEqual(verifyQualityGateTriggerScope(workflow), [
    "main",
    "feat/p0-b1-composed-fraud-boundary-final",
    "test/p0-b1-canonical-report-flake",
    "ci/p0-b1-stacked-quality-gate-routing",
  ]);
});

test("accepts the approved main-or-exact-stacked-base typecheck routing", () => {
  assert.doesNotThrow(() => verifyQualityGateStackedTypecheckRouting(workflow));
});

test("rejects a shallow checkout that cannot prove the event base", () => {
  const shallow = workflow.replace(
    "          fetch-depth: 0 # exact immutable pull-request base is required for stacked typecheck comparison\n",
    "          fetch-depth: 1\n"
  );
  assert.throws(
    () => verifyQualityGateStackedTypecheckRouting(shallow),
    /full immutable history/
  );
});

test("rejects removal of hosted stacked comparator guard tests", () => {
  const unsafe = workflow.replace(
    "      - name: Verify Quality Gate guard regressions\n        run: >-\n          node --test scripts/ci/verify-quality-gate-trigger-scope.test.mjs\n          scripts/ci/typecheck-stacked-base.test.mjs\n          scripts/ci/verify-p0-b1-client-hold-boundary.test.mjs\n",
    ""
  );
  assert.throws(
    () => verifyQualityGateStackedTypecheckRouting(unsafe),
    /must run the approved trigger and stacked-comparator guard regression tests/
  );
});

test("rejects removal of the hosted P0-B1 client hold-boundary guard", () => {
  const unsafe = workflow.replace(
    "          scripts/ci/verify-p0-b1-client-hold-boundary.test.mjs\n",
    ""
  );
  assert.throws(
    () => verifyQualityGateStackedTypecheckRouting(unsafe),
    /must run the approved trigger and stacked-comparator guard regression tests/
  );
});

test("rejects a stack branch routed to the committed main baseline", () => {
  const unsafe = workflow.replace(
    '            node scripts/ci/typecheck-stacked-base.mjs --base-sha "$STACKED_BASE_SHA"\n',
    "            node scripts/ci/typecheck-baseline.mjs\n"
  );
  assert.throws(
    () => verifyQualityGateStackedTypecheckRouting(unsafe),
    /main-or-exact-stacked-base/
  );
});

test("rejects an added top-level trigger", () => {
  const broadened = workflow.replace(
    "  push:\n",
    "  pull_request_target:\n    branches: [main]\n  push:\n"
  );
  assert.throws(
    () => verifyQualityGateTriggerScope(broadened),
    /Unexpected KINGA Quality Gate trigger configuration/
  );
});

test("rejects equivalent duplicate root trigger syntax after the workflow body", () => {
  for (const key of [
    "on:",
    "on: # duplicate",
    "on: ",
    "on:\t",
    "on :",
    '"on":',
    "'on':",
    "!!str on:",
    "&duplicate on:",
  ]) {
    const duplicateRootTrigger = `${workflow}\n${key}\n  pull_request_target:\n    branches: [main]\n`;
    assert.throws(
      () => verifyQualityGateTriggerScope(duplicateRootTrigger),
      /Unexpected KINGA Quality Gate root mapping|Unexpected root-level YAML syntax/,
      key
    );
  }
});

test("rejects an explicit duplicate YAML root trigger key", () => {
  const explicitDuplicateRootTrigger = `${workflow}\n? on\n:\n  pull_request_target:\n    branches: [main]\n`;
  assert.throws(
    () => verifyQualityGateTriggerScope(explicitDuplicateRootTrigger),
    /Unexpected root-level YAML syntax/
  );
});

test("rejects a broadened pull-request base", () => {
  const broadened = workflow.replace(
    "      - ci/p0-b1-stacked-quality-gate-routing\n",
    "      - ci/p0-b1-stacked-quality-gate-routing\n      - feature/unreviewed\n"
  );
  assert.throws(
    () => verifyQualityGateTriggerScope(broadened),
    /Unexpected KINGA Quality Gate trigger configuration/
  );
});

test("rejects a broadened push trigger", () => {
  const broadened = workflow.replace(
    "    branches: [main]\n\npermissions:",
    "    branches: [main, feature/unreviewed]\n\npermissions:"
  );
  assert.throws(
    () => verifyQualityGateTriggerScope(broadened),
    /Unexpected KINGA Quality Gate trigger configuration/
  );
});

test("keeps the exact trigger block pinned", () => {
  assert.equal(
    workflow.match(/^on:\n[\s\S]*?(?=^permissions:)/m)?.[0],
    expectedTriggerBlock
  );
});
