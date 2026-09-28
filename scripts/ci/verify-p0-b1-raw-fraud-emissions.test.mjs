import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoRawFraudProcedureEmissions,
  assertRawFraudBaselineChangeAuthorization,
  assertShrinkOnlyRawFraudEmissionManifest,
  compareExactRawFraudEmissionManifest,
  createProgramForRepository,
  fingerprintRawFraudEmission,
  manifestRelativePath,
  scanRawFraudProcedureEmissions,
} from "./verify-p0-b1-raw-fraud-emissions.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(root, manifestRelativePath), "utf8")
);
const baseline = JSON.parse(
  await readFile(
    resolve(root, "scripts/ci/p0-b1-raw-fraud-emission-baseline.json"),
    "utf8"
  )
);

function sampleEntry(overrides = {}) {
  const entry = {
    key: "claims.get",
    path: "server/routers/claims.ts",
    line: 10,
    column: 3,
    fields: ["fraudRiskScore"],
    group: "claims_workflow_intake_approval",
    ...overrides,
  };
  return {
    ...entry,
    fingerprint: overrides.fingerprint ?? fingerprintRawFraudEmission(entry),
  };
}

async function makeFixture({
  procedureBody = "const rows = await getRawRows(); return rows;",
  dbSource = "export async function getRawRows() { return [{ id: 1, fraudRiskScore: 73 }]; }",
  helperSource = "",
  routerPreamble = "",
  procedureEntry = null,
  extraFiles = {},
} = {}) {
  const fixture = await mkdtemp(join(tmpdir(), "p0-bg3-fixture-"));
  const entry =
    procedureEntry ??
    `get: protectedProcedure.query(async () => { ${procedureBody} })`;
  const files = {
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          skipLibCheck: true,
        },
        include: ["server/**/*.ts", "shared/**/*.ts"],
      },
      null,
      2
    ),
    "server/_core/trpc.ts": `
export const router = value => value;
export const protectedProcedure = { query: callback => ({ callback }) };
`,
    "server/db.ts": dbSource,
    "shared/p0FraudDecisionHoldPresentation.ts": `
export function buildP0B1FraudDecisionHold() {
  return {
    status: "FRAUD_DECISION_WITHHELD" as const,
    reviewRequired: true,
    actionAllowed: false,
    allowedActions: [],
  };
}
`,
    "server/claims-router.ts": `
import { router, protectedProcedure } from "./_core/trpc.js";
import { getRawRows } from "./db.js";
${helperSource}
${routerPreamble}
export const claimsRouter = router({
  ${entry},
});
`,
    "server/routers.ts": `
import { router } from "./_core/trpc.js";
import { claimsRouter } from "./claims-router.js";
export const appRouter = router({ claims: claimsRouter });
export type AppRouter = typeof appRouter;
`,
    ...extraFiles,
  };
  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const destination = join(fixture, relativePath);
      const directory = destination.slice(0, destination.lastIndexOf("/"));
      await (
        await import("node:fs/promises")
      ).mkdir(directory, {
        recursive: true,
      });
      await writeFile(destination, content);
    })
  );
  return fixture;
}

async function scanFixture(options) {
  const fixture = await makeFixture(options);
  try {
    return scanRawFraudProcedureEmissions(
      createProgramForRepository(fixture),
      fixture
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test("matches the exact current unremediated raw-emission inventory", () => {
  const actual = scanRawFraudProcedureEmissions(
    createProgramForRepository(root),
    root
  );
  assert.deepEqual(actual, manifest);
  assert.equal(actual.length, 77);
  assert.equal(baseline.length, 77);
  assertShrinkOnlyRawFraudEmissionManifest(manifest, baseline);
});

test("discovers raw fraud fields returned through a shared database helper", async () => {
  const result = await scanFixture();
  assert.equal(result.length, 1);
  assert.equal(result[0].key, "claims.get");
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("discovers raw fraud fields returned through a local helper indirection", async () => {
  const result = await scanFixture({
    helperSource: `
function wrapper() { return getRawRows(); }
`,
    procedureBody: "return await wrapper();",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("detects a raw fraud field read through a computed literal key", async () => {
  const result = await scanFixture({
    dbSource: "export async function getRawRows() { return [{ id: 1 }]; }",
    procedureBody:
      'const row = await getRawRows(); return { value: row[0]["fraudRiskScore"] };',
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("quarantines a raw SQL result only when it reaches public output", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; const sql = strings => strings[0];',
    procedureBody:
      "const db = await getDb(); const [row] = await db.execute(sql`select fraud_risk_score from claims`); return { total: row.total };",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("does not mistake a lookalike execute receiver for database SQL", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      routerPreamble: "const sql = strings => strings[0];",
      procedureBody: `const fake = { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; const [row] = await fake.${method}(sql\`select fraud_risk_score from claims\`); return { total: row.total };`,
    });
    assert.deepEqual(result, [], method);
  }
});

test("quarantines direct database execute and query returns", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); return db.${method}(sql\`select fraud_risk_score from claims\`);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("quarantines raw SQL reached through a direct getConn accessor", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getConn() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getConn } from "./db.js"; const sql = strings => strings[0];',
    procedureBody:
      "const conn = await getConn(); const [row] = await conn.execute(sql`select fraud_risk_score from claims`); return { total: row.total };",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines raw values forwarded through nullish and logical aliases", async () => {
  for (const operator of ["??", "||", "&&"]) {
    const result = await scanFixture({
      procedureBody: `const rows = await getRawRows(); return rows ${operator} null;`,
    });
    assert.equal(result.length, 1, operator);
    assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
  }
});

test("quarantines raw SQL results forwarded through nullish and logical aliases", async () => {
  for (const operator of ["??", "||", "&&"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); const [row] = await db.execute(sql\`select fraud_risk_score from claims\`); return row ${operator} null;`,
    });
    assert.equal(result.length, 1, operator);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("quarantines bound database execute and query aliases", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); const run = db.${method}.bind(db); return await run(sql\`select fraud_risk_score from claims\`);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("does not mistake a bound lookalike SQL method for a database receiver", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      routerPreamble: "const sql = strings => strings[0];",
      procedureBody: `const fake = { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; const run = fake.${method}.bind(fake); return await run(sql\`select fraud_risk_score from claims\`);`,
    });
    assert.deepEqual(result, [], method);
  }
});

test("quarantines raw SQL constructed by the verified Drizzle sql.raw builder", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; import { sql } from "drizzle-orm";',
    procedureBody:
      'const db = await getDb(); const statement = sql.raw("select fraud_risk_score from claims"); return db.execute(statement);',
    extraFiles: {
      "node_modules/drizzle-orm/index.d.ts":
        "export declare const sql: { raw(value: string): string };",
    },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines logical and conditional raw SQL statement aliases", async () => {
  for (const expression of [
    'sql`select fraud_risk_score from claims` ?? ""',
    'sql`select fraud_risk_score from claims` || ""',
    'sql`select fraud_risk_score from claims` && "fallback"',
    'Math.random() > 0.5 ? sql`select fraud_risk_score from claims` : ""',
  ]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); const statement = ${expression}; return db.execute(statement);`,
    });
    assert.equal(result.length, 1, expression);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("quarantines raw SQL constructed by a verified Drizzle builder alias", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; import { sql as drizzleSql } from "drizzle-orm"; const builder = drizzleSql;',
    procedureBody:
      'const db = await getDb(); const statement = builder.raw("select fraud_risk_score from claims"); return db.execute(statement);',
    extraFiles: {
      "node_modules/drizzle-orm/index.d.ts":
        "export declare const sql: { raw(value: string): string };",
    },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("does not trust a same-shaped local SQL builder", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; const builder = { raw(value) { return value; } };',
    procedureBody:
      'const db = await getDb(); const statement = builder.raw("select fraud_risk_score from claims"); return db.execute(statement);',
  });
  assert.deepEqual(result, []);
});

test("quarantines raw SQL through imported and local database accessor aliases", async () => {
  for (const setup of [
    {
      preamble:
        'import { getDb as open } from "./db.js"; const sql = strings => strings[0];',
      body: "const db = await open(); return db.execute(sql`select fraud_risk_score from claims`);",
    },
    {
      preamble:
        'import { getDb } from "./db.js"; const open = getDb; const sql = strings => strings[0];',
      body: "const db = await open(); return db.execute(sql`select fraud_risk_score from claims`);",
    },
  ]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
      routerPreamble: setup.preamble,
      procedureBody: setup.body,
    });
    assert.equal(result.length, 1, setup.preamble);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("does not trust a same-shaped non-database accessor alias", async () => {
  const result = await scanFixture({
    routerPreamble:
      "const sql = strings => strings[0]; const open = async () => ({ execute: async () => [{ total: 1 }] });",
    procedureBody:
      "const db = await open(); return db.execute(sql`select fraud_risk_score from claims`);",
  });
  assert.deepEqual(result, []);
});

test("quarantines raw SQL result method-receiver transforms", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; const sql = strings => strings[0];',
    procedureBody:
      "const db = await getDb(); const rows = await db.execute(sql`select fraud_risk_score from claims`); return rows.map(row => ({ ...row }));",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines unbound database execute and query aliases", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); const run = db.${method}; return run(sql\`select fraud_risk_score from claims\`);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("does not trust unbound lookalike execute and query aliases", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      routerPreamble:
        "const sql = strings => strings[0]; const fake = { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] };",
      procedureBody: `const run = fake.${method}; return run(sql\`select fraud_risk_score from claims\`);`,
    });
    assert.deepEqual(result, [], method);
  }
});

test("quarantines direct aliases of the verified Drizzle sql.raw callable", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; import { sql } from "drizzle-orm"; const raw = sql.raw;',
    procedureBody:
      'const db = await getDb(); return db.execute(raw("select fraud_risk_score from claims"));',
    extraFiles: {
      "node_modules/drizzle-orm/index.d.ts":
        "export declare const sql: { raw(value: string): string };",
    },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("does not trust a direct alias of a local sql.raw lookalike", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; const sql = { raw(value) { return value; } }; const raw = sql.raw;',
    procedureBody:
      'const db = await getDb(); return db.execute(raw("select fraud_risk_score from claims"));',
  });
  assert.deepEqual(result, []);
});

test("quarantines literal-computed aliases of the verified Drizzle sql.raw callable", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; import { sql } from "drizzle-orm"; const raw = sql["raw"];',
    procedureBody:
      'const db = await getDb(); return db.execute(raw("select fraud_risk_score from claims"));',
    extraFiles: {
      "node_modules/drizzle-orm/index.d.ts":
        "export declare const sql: { raw(value: string): string };",
    },
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("does not trust a drizzle-orm-named lookalike package", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; import { sql } from "acme-drizzle-orm-lookalike"; const raw = sql.raw;',
    procedureBody:
      'const db = await getDb(); return db.execute(raw("select fraud_risk_score from claims"));',
    extraFiles: {
      "node_modules/acme-drizzle-orm-lookalike/index.d.ts":
        "export declare const sql: { raw(value: string): string };",
    },
  });
  assert.deepEqual(result, []);
});

test("quarantines a later-assigned raw SQL result transformed through a receiver", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    routerPreamble:
      'import { getDb } from "./db.js"; const sql = strings => strings[0];',
    procedureBody:
      "const db = await getDb(); let rows; rows = await db.execute(sql`select fraud_risk_score from claims`); return rows.map(row => ({ ...row }));",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines a later-assigned stored raw-fraud value", async () => {
  const result = await scanFixture({
    procedureBody: "let rows; rows = await getRawRows(); return rows;",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("quarantines database execute and query call invocations", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); return db.${method}.call(db, sql\`select fraud_risk_score from claims\`);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("does not trust lookalike execute and query call invocations", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      routerPreamble:
        "const sql = strings => strings[0]; const fake = { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] };",
      procedureBody: `return fake.${method}.call(fake, sql\`select fraud_risk_score from claims\`);`,
    });
    assert.deepEqual(result, [], method);
  }
});

test("quarantines literal-computed database execute and query call invocations", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); return db.${method}["call"](db, sql\`select fraud_risk_score from claims\`);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("quarantines database execute and query apply invocations", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] }; }
`,
      routerPreamble:
        'import { getDb } from "./db.js"; const sql = strings => strings[0];',
      procedureBody: `const db = await getDb(); return db.${method}.apply(db, [sql\`select fraud_risk_score from claims\`]);`,
    });
    assert.equal(result.length, 1, method);
    assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
  }
});

test("does not trust lookalike execute and query apply invocations", async () => {
  for (const method of ["execute", "query"]) {
    const result = await scanFixture({
      routerPreamble:
        "const sql = strings => strings[0]; const fake = { execute: async () => [{ total: 1 }], query: async () => [{ total: 1 }] };",
      procedureBody: `return fake.${method}.apply(fake, [sql\`select fraud_risk_score from claims\`]);`,
    });
    assert.deepEqual(result, [], method);
  }
});

test("does not trust a local getDb-named lookalike accessor", async () => {
  const result = await scanFixture({
    routerPreamble:
      "const sql = strings => strings[0]; async function getDb() { return { execute: async () => [{ total: 1 }] }; }",
    procedureBody:
      "const db = await getDb(); return db.execute(sql`select fraud_risk_score from claims`);",
  });
  assert.deepEqual(result, []);
});

test("quarantines raw SQL through a local wrapper of a dynamic real-db import", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    helperSource:
      'async function getClaimsDb() { const { getDb } = await import("./db.js"); return getDb(); }',
    routerPreamble: "const sql = strings => strings[0];",
    procedureBody:
      "const db = await getClaimsDb(); return db.execute(sql`select fraud_risk_score from claims`);",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines raw SQL through an arbitrary-name real-db wrapper", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { execute: async () => [{ total: 1 }] }; }
`,
    helperSource:
      'async function openClaimDatabase() { const { getDb } = await import("./db.js"); return getDb(); }',
    routerPreamble: "const sql = strings => strings[0];",
    procedureBody:
      "const db = await openClaimDatabase(); return db.execute(sql`select fraud_risk_score from claims`);",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("quarantines a local helper that returns a raw SQL result", async () => {
  const result = await scanFixture({
    dbSource: `
export async function getRawRows() { return [{ id: 1 }]; }
export async function getDb() { return { query: async () => [{ total: 1 }] }; }
`,
    routerPreamble: `
import { getDb } from "./db.js";
const sql = strings => strings[0];
async function rawSqlHelper() { const db = await getDb(); return db.query(sql\`select fraud_risk_score from claims\`); }
`,
    procedureBody: "return rawSqlHelper();",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["UNRESOLVED_RAW_FRAUD_SQL_OUTPUT"]);
});

test("does not treat an ordinary fraud-named input string as SQL evidence", async () => {
  const result = await scanFixture({
    dbSource: "export async function getRawRows() { return [{ id: 1 }]; }",
    procedureBody: 'const factor = "fraud_flags"; return { factor, value: 0 };',
  });
  assert.deepEqual(result, []);
});

test("does not treat a canonical hold route as a raw-emission candidate", async () => {
  const result = await scanFixture({
    routerPreamble:
      'import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation.js";',
    procedureBody: "return buildP0B1FraudDecisionHold();",
  });
  assert.deepEqual(result, []);
});

test("does not let a canonical hold branch suppress a raw output branch", async () => {
  const result = await scanFixture({
    routerPreamble:
      'import { buildP0B1FraudDecisionHold } from "../shared/p0FraudDecisionHoldPresentation.js";',
    procedureBody:
      "if (Math.random() > 0.5) return buildP0B1FraudDecisionHold(); const rows = await getRawRows(); return rows;",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("does not trust a status lookalike carrying a raw field", async () => {
  const result = await scanFixture({
    procedureBody:
      'const rows = await getRawRows(); return { status: "FRAUD_DECISION_WITHHELD", fraudRiskScore: rows[0].fraudRiskScore };',
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("discovers an identifier-exported procedure value", async () => {
  const result = await scanFixture({
    routerPreamble:
      "const exportedProcedure = protectedProcedure.query(async () => { const rows = await getRawRows(); return rows; });",
    procedureEntry: "get: exportedProcedure",
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("fails closed when an identifier-exported procedure cannot be resolved", async () => {
  const fixture = await makeFixture({
    procedureEntry: "get: unknownProcedure",
  });
  try {
    assert.throws(
      () =>
        scanRawFraudProcedureEmissions(
          createProgramForRepository(fixture),
          fixture
        ),
      /cannot be resolved to a trusted inline tRPC procedure callback/
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("quarantines raw values hidden in generic transforms and computed aliases", async () => {
  const result = await scanFixture({
    procedureBody:
      'const rows = await getRawRows(); const field = "fraudRiskScore"; return Object.assign({}, { value: rows[0][field] });',
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].fields, ["fraudRiskScore"]);
});

test("rejects an unreviewed new raw-emission candidate", () => {
  const expected = [sampleEntry()];
  const actual = [
    sampleEntry(),
    sampleEntry({ key: "claims.future", line: 11 }),
  ];
  assert.throws(
    () => compareExactRawFraudEmissionManifest(actual, expected),
    /unreviewed raw-fraud candidate: claims\.future/
  );
});

test("rejects a removed or moved quarantined raw-emission candidate", () => {
  const expected = [sampleEntry()];
  const actual = [sampleEntry({ line: 11 })];
  assert.throws(
    () => compareExactRawFraudEmissionManifest(actual, expected),
    /missing or moved candidate: claims\.get/
  );
});

test("rejects a stale manifest fingerprint and does not permit a wildcard", () => {
  const expected = [{ ...sampleEntry(), path: "server/routers/moved.ts" }];
  assert.throws(
    () => compareExactRawFraudEmissionManifest([sampleEntry()], expected),
    /fingerprint does not match its route, source location, and fields/
  );
  assert.throws(
    () =>
      compareExactRawFraudEmissionManifest(
        [sampleEntry({ fingerprint: "*" })],
        []
      ),
    /invalid exact fingerprint shape/
  );
});

test("permits only shrinkage from the approved raw-emission baseline", () => {
  const approvedBaseline = baseline;
  assert.doesNotThrow(() =>
    assertShrinkOnlyRawFraudEmissionManifest(
      approvedBaseline.slice(1),
      approvedBaseline
    )
  );
  assert.throws(
    () =>
      assertShrinkOnlyRawFraudEmissionManifest(
        [...approvedBaseline, sampleEntry({ key: "claims.new", line: 12 })],
        approvedBaseline
      ),
    /shrink-only: committed inventory exceeds its approved baseline/
  );
  assert.throws(
    () =>
      assertShrinkOnlyRawFraudEmissionManifest(
        [sampleEntry({ key: "claims.moved", line: 12 })],
        approvedBaseline
      ),
    /new entry requires explicit owner-approved baseline change: claims\.moved/
  );
});

test("requires the dedicated owner-approval label when the immutable baseline changes", () => {
  const alteredEntry = {
    ...baseline[0],
    fields: [...baseline[0].fields, "fraudProbabilityScore"].sort(),
  };
  alteredEntry.fingerprint = fingerprintRawFraudEmission(alteredEntry);
  const alteredBaseline = [alteredEntry, ...baseline.slice(1)];
  assert.throws(
    () =>
      assertRawFraudBaselineChangeAuthorization({
        baseline: alteredBaseline,
        baseBaseline: baseline,
        baseSha: "base-sha",
        approvalLabelPresent: false,
      }),
    /p0-b1-raw-fraud-baseline-approved/
  );
  assert.doesNotThrow(() =>
    assertRawFraudBaselineChangeAuthorization({
      baseline: alteredBaseline,
      baseBaseline: baseline,
      baseSha: "base-sha",
      approvalLabelPresent: true,
    })
  );
});

test("zero-tolerance enforcement names every remaining raw-emission candidate", () => {
  assert.throws(
    () => assertNoRawFraudProcedureEmissions([sampleEntry()]),
    /P0-B1 raw fraud data remains reachable through exported tRPC procedure output/
  );
});
