import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/kinga-quality-gate.yml", import.meta.url)
);

export const expectedTriggerBlock = `on:
  pull_request:
    branches:
      - main
      - feat/p0-b1-composed-fraud-boundary-final
      - test/p0-b1-canonical-report-flake
  push:
    branches: [main]

`;

export const expectedCheckoutBlock = `      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          fetch-depth: 0 # exact immutable pull-request base is required for stacked typecheck comparison
`;

export const expectedGuardRegressionBlock = `      - name: Verify Quality Gate guard regressions
        run: >-
          node --test scripts/ci/verify-quality-gate-trigger-scope.test.mjs
          scripts/ci/typecheck-stacked-base.test.mjs
`;

export const expectedTypecheckBlock = `      - name: TypeScript baseline comparison
        env:
          STACKED_BASE_SHA: \${{ github.event_name == 'pull_request' && github.event.pull_request.base.ref != 'main' && github.event.pull_request.base.sha || '' }}
        run: |
          if [ -n "$STACKED_BASE_SHA" ]; then
            node scripts/ci/typecheck-stacked-base.mjs --base-sha "$STACKED_BASE_SHA"
          else
            node scripts/ci/typecheck-baseline.mjs
          fi
`;

export function verifyQualityGateTriggerScope(workflow) {
  const expectedRootKeys = ["name", "on", "permissions", "concurrency", "jobs"];
  const rootLines = workflow
    .split("\n")
    .filter(line => line.length > 0 && !/^[ \t#]/.test(line));
  const rootKeys = rootLines.map(line => {
    const key = line.match(/^(name|on|permissions|concurrency|jobs):/);
    if (!key) {
      throw new Error(`Unexpected root-level YAML syntax: ${line}`);
    }
    return key[1];
  });

  if (
    rootKeys.length !== expectedRootKeys.length ||
    rootKeys.some((key, index) => key !== expectedRootKeys[index])
  ) {
    throw new Error(
      `Unexpected KINGA Quality Gate root mapping: ${JSON.stringify(rootKeys)}. ` +
        `Expected exactly: ${JSON.stringify(expectedRootKeys)}.`
    );
  }

  const triggerBlock = workflow.match(/^on:\n[\s\S]*?(?=^permissions:)/m)?.[0];
  if (!triggerBlock) {
    throw new Error(
      "KINGA Quality Gate must define an on trigger block before permissions."
    );
  }

  if (triggerBlock !== expectedTriggerBlock) {
    throw new Error(
      "Unexpected KINGA Quality Gate trigger configuration. " +
        "Only the approved pull-request bases and main-only push trigger are allowed."
    );
  }

  return [
    "main",
    "feat/p0-b1-composed-fraud-boundary-final",
    "test/p0-b1-canonical-report-flake",
  ];
}

export function verifyQualityGateStackedTypecheckRouting(workflow) {
  const checkoutBlock = workflow.match(
    /^      - uses: actions\/checkout[\s\S]*?(?=^      - uses: pnpm\/action-setup)/m
  )?.[0];
  if (checkoutBlock !== expectedCheckoutBlock) {
    throw new Error(
      "Quality Gate checkout must fetch full immutable history for exact stacked-base comparison."
    );
  }

  const guardRegressionBlock = workflow.match(
    /^      - name: Verify Quality Gate guard regressions\n[\s\S]*?(?=^      - name: TypeScript baseline comparison)/m
  )?.[0];
  if (guardRegressionBlock !== expectedGuardRegressionBlock) {
    throw new Error(
      "Quality Gate must run the approved trigger and stacked-comparator guard regression tests."
    );
  }

  const typecheckBlock = workflow.match(
    /^      - name: TypeScript baseline comparison\n[\s\S]*?(?=^      - name: Upload TypeScript baseline report)/m
  )?.[0];
  if (typecheckBlock !== expectedTypecheckBlock) {
    throw new Error(
      "Quality Gate must use the approved main-or-exact-stacked-base TypeScript comparison routing."
    );
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const workflow = await readFile(workflowPath, "utf8");
  const pullRequestBases = verifyQualityGateTriggerScope(workflow);
  verifyQualityGateStackedTypecheckRouting(workflow);
  console.log(
    `Quality Gate trigger scope and stacked TypeScript routing verified: ${pullRequestBases.join(", ")}; pushes remain main-only.`
  );
}
