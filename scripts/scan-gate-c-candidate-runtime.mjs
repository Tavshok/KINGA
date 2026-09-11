import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputPath = path.join(
  repositoryRoot,
  "audit",
  "gate-c-candidate-runtime-scan.json",
);

const candidates = [
  "claim_comment_reads",
  "tenant_usage_summary",
  "tenant_tier_history",
  "audit_logs",
  "currency_exchange_rates",
  "benchmark_deviations",
  "adjuster_sign_offs",
  "photo_reextraction_jobs",
  "vehicle_models",
  "measurement_types",
  "vehicle_geometry_measurements",
  "vehicle_landmarks",
  "geometry_sources",
  "vision_calibration_results",
];

const sourceRoots = ["server", "client", "shared", "drizzle"];
const ignoredDirectoryNames = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".manus-logs",
]);
const nonProductionPath = /(^|\/)(audit|docs|drizzle)\//;
const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const discovered = [];

  for (const entry of entries) {
    if (ignoredDirectoryNames.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...(await walk(fullPath)));
      continue;
    }
    if (/\.[cm]?[jt]sx?$/.test(entry.name)) discovered.push(fullPath);
  }

  return discovered;
}

function extractSchemaIdentifiers(schemaSource) {
  const identifiers = new Map();
  for (const tableName of candidates) {
    const literal = escapeRegex(tableName);
    const pattern = new RegExp(
      `export\\s+const\\s+([A-Za-z0-9_]+)\\s*=\\s*(?:mysql|pg)Table\\(\\s*["']${literal}["']`,
      "g",
    );
    identifiers.set(
      tableName,
      [...schemaSource.matchAll(pattern)].map((match) => match[1]),
    );
  }
  return identifiers;
}

function importSourceReferences(source) {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
}

async function main() {
  const files = (
    await Promise.all(sourceRoots.map((root) => walk(path.join(repositoryRoot, root))))
  ).flat();
  const fileSources = await Promise.all(
    files.map(async (absolutePath) => ({
      absolutePath,
      relativePath: path.relative(repositoryRoot, absolutePath),
      source: await readFile(absolutePath, "utf8"),
    })),
  );
  const schemaFile = fileSources.find(
    ({ relativePath }) => relativePath === "drizzle/schema.ts",
  );
  if (!schemaFile) throw new Error("Expected drizzle/schema.ts was not found");

  const schemaIdentifiers = extractSchemaIdentifiers(schemaFile.source);
  const entries = candidates.map((tableName) => {
    const identifiers = schemaIdentifiers.get(tableName) ?? [];
    const tokenPatterns = [tableName, ...identifiers].map(
      (token) => new RegExp(`\\b${escapeRegex(token)}\\b`),
    );
    const hits = fileSources
      .filter(({ relativePath, source }) =>
        tokenPatterns.some((pattern) => pattern.test(source)),
      )
      .map(({ relativePath, source }) => ({
        path: relativePath,
        productionCandidate:
          !nonProductionPath.test(relativePath) && !testFile.test(relativePath),
        mentionsPhysicalName: new RegExp(`\\b${escapeRegex(tableName)}\\b`).test(source),
        mentionsSchemaIdentifier: identifiers.some((identifier) =>
          new RegExp(`\\b${escapeRegex(identifier)}\\b`).test(source),
        ),
        imports: importSourceReferences(source),
      }));

    return {
      tableName,
      schemaIdentifiers: identifiers,
      sourceHits: hits,
      productionCandidateHits: hits.filter((hit) => hit.productionCandidate),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    scope: {
      databaseAccessed: false,
      ddlGenerated: false,
      rootsScanned: sourceRoots,
      excludedFromRuntimeProof: ["docs", "audit", "drizzle", "*.test.*", "*.spec.*"],
    },
    entries,
  };

  await rm(outputPath, { force: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      entries.map((entry) => ({
        table: entry.tableName,
        schemaIdentifiers: entry.schemaIdentifiers,
        productionCandidateHits: entry.productionCandidateHits.map((hit) => hit.path),
      })),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
