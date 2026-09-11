#!/usr/bin/env node

/**
 * Gate C read-only inventory. This script reports quoted CURRENT_TIMESTAMP
 * defaults from authoritative schema source; it never opens a database and it
 * never rewrites the source it examines.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const schemaPath = resolve(repositoryRoot, "drizzle/schema.ts");
const outputDirectory = resolve(repositoryRoot, "audit/gate-c-scratch-baseline");
const outputPath = resolve(outputDirectory, "quoted-current-timestamp-defaults.json");
const waveOneTables = new Set(["tenant_invitations", "tenants", "users"]);

const source = await readFile(schemaPath, "utf8");
const occurrences = [];
let currentTable;

for (const [index, line] of source.split(/\r?\n/).entries()) {
  const declaration = line.match(/^export const (\w+) = mysqlTable\("([^"]+)"/);
  if (declaration) {
    currentTable = { exportName: declaration[1], physicalName: declaration[2] };
  }
  if (!line.includes(".default('CURRENT_TIMESTAMP')")) continue;
  const field = line.match(/^\s*([A-Za-z0-9_]+)\s*:/)?.[1] ?? null;
  occurrences.push({
    line: index + 1,
    table: currentTable?.physicalName ?? null,
    exportName: currentTable?.exportName ?? null,
    field,
    scope: waveOneTables.has(currentTable?.physicalName) ? "wave_one" : "outside_wave_one",
    source: line.trim(),
  });
}

const result = {
  scope: "repository-only quoted CURRENT_TIMESTAMP default inventory",
  source: "drizzle/schema.ts",
  total: occurrences.length,
  waveOneCount: occurrences.filter((occurrence) => occurrence.scope === "wave_one").length,
  outsideWaveOneCount: occurrences.filter((occurrence) => occurrence.scope === "outside_wave_one").length,
  occurrences,
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  total: result.total,
  waveOneCount: result.waveOneCount,
  outsideWaveOneCount: result.outsideWaveOneCount,
  outputPath,
}));
