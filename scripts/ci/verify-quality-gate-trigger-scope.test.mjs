import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedTriggerBlock,
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
  ]);
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
    "      - test/p0-b1-canonical-report-flake\n",
    "      - test/p0-b1-canonical-report-flake\n      - feature/unreviewed\n"
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
