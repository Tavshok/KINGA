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

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const workflow = await readFile(workflowPath, "utf8");
  const pullRequestBases = verifyQualityGateTriggerScope(workflow);
  console.log(
    `Quality Gate trigger scope verified: ${pullRequestBases.join(", ")}; pushes remain main-only.`
  );
}
