import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compareExactHoldConsumerManifest,
  createProgramForRepository,
  fingerprintHoldConsumer,
  manifestRelativePath,
  scanTypedFraudHoldConsumers,
} from "./verify-p0-b1-typed-hold-consumers.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, manifestRelativePath), "utf8")
);
const consumers = scanTypedFraudHoldConsumers(
  createProgramForRepository(root),
  root
);

function sampleEntry(overrides = {}) {
  const entry = {
    path: "client/src/pages/Sample.tsx",
    line: 10,
    column: 3,
    kind: "query",
    callee: "trpc.sample.get.useQuery",
    detection: "server-canonical-hold",
    ...overrides,
  };
  return {
    ...entry,
    fingerprint: overrides.fingerprint ?? fingerprintHoldConsumer(entry),
  };
}

async function makeFixture({
  appRouterExported = true,
  procedureBody = "withhold();",
  hookExpression = 'trpc["test"]["get"].useQuery()',
  hookBody = null,
  clientRouterType = "AppRouter",
  clientRouterModule = "../../../server/routers.js",
} = {}) {
  const fixture = await mkdtemp(join(tmpdir(), "p0-bg1-fixture-"));
  const files = {
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noLib: true,
          skipLibCheck: true,
        },
        include: [
          "server/**/*.ts",
          "shared/**/*.ts",
          "client/**/*.ts",
          "client/**/*.tsx",
        ],
      },
      null,
      2
    ),
    "shared/p0FraudDecisionHoldPresentation.ts": `
export function buildP0B1FraudDecisionHold() {
  return { status: "FRAUD_DECISION_WITHHELD" as const };
}
`,
    "server/evidence-governance/p0FraudDecisionHold.ts": `
export function throwP0B1FraudDecisionHold(): never { throw { status: "FRAUD_DECISION_WITHHELD" as const }; }
`,
    "server/test-router.ts": `
import { throwP0B1FraudDecisionHold as withhold } from "./evidence-governance/p0FraudDecisionHold.js";
const router = value => value;
const procedure = { query: callback => ({ callback }) };
function makeRealCanonicalHold() { return { status: "FRAUD_DECISION_WITHHELD" as const }; }
function throwP0B1FraudDecisionHold() { return { ok: true }; }
export const testRouter = router({
  get: procedure.query(async () => { ${procedureBody} }),
});
`,
    "server/routers.ts": `
import { testRouter } from "./test-router.js";
const router = value => value;
${appRouterExported ? "export " : ""}const appRouter = router({ test: testRouter });
export type AppRouter = typeof appRouter;
`,
    "server/not-app-router.ts": `
import { appRouter } from "./routers.js";
export type DifferentRouter = typeof appRouter;
`,
    "client/src/lib/trpc.ts": `
import type { ${clientRouterType} } from "${clientRouterModule}";
declare function createTRPCReact<T>(): any;
export const trpc = createTRPCReact<${clientRouterType}>();
`,
    "client/src/pages/Legacy.tsx": `
import { trpc } from "../lib/trpc.js";
const api = trpc as any;
export const Legacy = () => ${hookBody ? `{ ${hookBody} }` : hookExpression};
`,
  };

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const destination = join(fixture, relativePath);
      const directory = destination.slice(0, destination.lastIndexOf("/"));
      await (
        await import("node:fs/promises")
      ).mkdir(directory, { recursive: true });
      await writeFile(destination, content);
    })
  );
  return fixture;
}

async function scanFixture(options) {
  const fixture = await makeFixture(options);
  try {
    return scanTypedFraudHoldConsumers(
      createProgramForRepository(fixture),
      fixture
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test("matches the exact current fraud-hold consumer inventory", () => {
  assert.deepEqual(consumers, manifest);
  assert.ok(consumers.length >= 37);
});

test("rejects an unreviewed future fraud-hold consumer", () => {
  const expected = [sampleEntry()];
  const actual = [
    sampleEntry(),
    sampleEntry({ path: "client/src/pages/Future.tsx" }),
  ];

  assert.throws(
    () => compareExactHoldConsumerManifest(actual, expected),
    /unreviewed consumer: client\/src\/pages\/Future\.tsx:10:3/
  );
});

test("rejects a removed or moved approved fraud-hold consumer", () => {
  const expected = [sampleEntry()];
  const actual = [sampleEntry({ line: 11 })];

  assert.throws(
    () => compareExactHoldConsumerManifest(actual, expected),
    /missing or moved approved consumer: client\/src\/pages\/Sample\.tsx:10:3/
  );
});

test("rejects a manifest field edit that retains a stale fingerprint", () => {
  const actual = [sampleEntry()];
  const expected = [{ ...sampleEntry(), line: 11 }];

  assert.throws(
    () => compareExactHoldConsumerManifest(actual, expected),
    /fingerprint does not match its path, location, kind, callee, and detection fields/
  );
});

test("rejects duplicate manifest fingerprints", () => {
  const entry = sampleEntry();

  assert.throws(
    () => compareExactHoldConsumerManifest([entry], [entry, entry]),
    /contains a duplicate exact fingerprint/
  );
});

test("rejects a manifest entry with an extra field", () => {
  const entry = { ...sampleEntry(), unreviewed: true };

  assert.throws(
    () => compareExactHoldConsumerManifest([sampleEntry()], [entry]),
    /must contain exactly the approved fingerprint fields/
  );
});

test("rejects a manifest entry with a missing field", () => {
  const { detection, ...entry } = sampleEntry();
  assert.equal(detection, "server-canonical-hold");

  assert.throws(
    () => compareExactHoldConsumerManifest([sampleEntry()], [entry]),
    /must contain exactly the approved fingerprint fields/
  );
});

test("scanner discovers B-G0 and B-R2 hold boundaries from current source", () => {
  const keys = new Set(consumers.map(entry => `${entry.path}:${entry.callee}`));

  assert.ok(
    keys.has(
      "client/src/components/executive/ExecutiveAlertsCenter.tsx:trpc.analytics.getExecutiveAlerts.useQuery"
    )
  );
  assert.ok(
    keys.has(
      "client/src/components/PoliceReportForm.tsx:trpc.policeReports.create.useMutation"
    )
  );
  assert.ok(
    keys.has(
      "client/src/pages/ClaimDecisionReport.page.tsx:trpc.aiAssessments.byClaim.useQuery"
    )
  );

  const executiveAlerts = consumers.find(
    entry =>
      entry.path ===
        "client/src/components/executive/ExecutiveAlertsCenter.tsx" &&
      entry.callee === "trpc.analytics.getExecutiveAlerts.useQuery"
  );
  assert.equal(executiveAlerts?.detection, "server-canonical-hold");
});

test("discovers an aliased canonical helper through an imported router and casted computed tRPC hook", async () => {
  const result = await scanFixture();
  assert.equal(result.length, 1);
  assert.deepEqual(
    {
      path: result[0].path,
      kind: result[0].kind,
      callee: result[0].callee,
      detection: result[0].detection,
    },
    {
      path: "client/src/pages/Legacy.tsx",
      kind: "query",
      callee: "trpc.test.get.useQuery",
      detection: "server-canonical-hold",
    }
  );
});

test("discovers a transitive helper whose semantic return is the canonical status", async () => {
  const result = await scanFixture({
    procedureBody: "return makeRealCanonicalHold();",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].detection, "server-canonical-hold");
});

test("rejects a same-spelling local helper decoy without a canonical result", async () => {
  const result = await scanFixture({
    procedureBody: "return throwP0B1FraudDecisionHold();",
  });
  assert.deepEqual(result, []);
});

test("fails closed when appRouter is not exported", async () => {
  const fixture = await makeFixture({ appRouterExported: false });
  try {
    assert.throws(
      () =>
        scanTypedFraudHoldConsumers(
          createProgramForRepository(fixture),
          fixture
        ),
      /appRouter must be exactly one exported variable declaration/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("fails closed when trpc uses a lookalike router alias", async () => {
  const fixture = await makeFixture({
    clientRouterType: "DifferentRouter",
    clientRouterModule: "../../../server/not-app-router.js",
  });
  try {
    assert.throws(
      () =>
        scanTypedFraudHoldConsumers(
          createProgramForRepository(fixture),
          fixture
        ),
      /must import the exact exported AppRouter alias/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("fails closed when a tRPC hook cannot resolve literal namespace and procedure keys", async () => {
  const fixture = await makeFixture({
    hookExpression: "api[unknown].useQuery()",
  });
  try {
    assert.throws(
      () =>
        scanTypedFraudHoldConsumers(
          createProgramForRepository(fixture),
          fixture
        ),
      /must use a literal namespace and procedure key/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("fails closed when a dynamic procedure key follows a derived trpc namespace", async () => {
  const fixture = await makeFixture({
    hookBody:
      'const test = trpc.test; const procedure = "get"; return test[procedure].useQuery();',
  });
  try {
    assert.throws(
      () =>
        scanTypedFraudHoldConsumers(
          createProgramForRepository(fixture),
          fixture
        ),
      /must use a literal namespace and procedure key/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("fails closed when a dynamic procedure key follows a destructured trpc namespace", async () => {
  const fixture = await makeFixture({
    hookBody:
      'const { test } = trpc; const procedure = "get"; return test[procedure].useQuery();',
  });
  try {
    assert.throws(
      () =>
        scanTypedFraudHoldConsumers(
          createProgramForRepository(fixture),
          fixture
        ),
      /must use a literal namespace and procedure key/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
