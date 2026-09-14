/**
 * Generates review artefacts only. This script reads repository files and writes
 * manifests under audit/staging-schema-manifest; it never opens a database,
 * invokes Drizzle, runs SQL, reads environment variables, or changes staging.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "audit", "staging-schema-manifest");
const excludedDirectories = new Set([".git", "node_modules", "dist", ".manus-logs", ".vite"]);
const sourceRoots = ["server", "client", "shared"];
const knownRepairPrerequisites = new Map([
  ["ai_assessments", "Journal gap: migrations 0056/0057 are not registered in drizzle/meta/_journal.json."],
  ["claims", "Journal gap: migration 0059 is not registered in drizzle/meta/_journal.json."],
  ["claim_comments", "Migration 0058 has a known physical-column rename assumption that can abort later additions."],
  ["governance_notifications", "Migration 0045 has a known TEXT-index failure requiring a corrected, reviewed chain repair."],
  ["rate_limit_tracking", "The checked-in SQL is manually maintained outside the numbered, journaled migration sequence."],
]);
const gateCDispositionsPath = path.join(repoRoot, "docs", "staging-schema-reconciliation", "gate-c-runtime-candidate-dispositions.json");
const gateCDispositions = JSON.parse(fs.readFileSync(gateCDispositionsPath, "utf8"));
const gateCCandidateDispositions = new Map(gateCDispositions.candidateTables.map((entry) => [entry.tableName, entry]));
const physicalNameDecisions = new Map(gateCDispositions.physicalNameDecisions.map((entry) => [entry.tableName, entry]));

function walk(directory, predicate = () => true) {
  const result = [];
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...walk(fullPath, predicate));
    else if (predicate(fullPath)) result.push(fullPath);
  }
  return result.sort();
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function lineNumber(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return node.getText();
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    if (ts.isCallExpression(current)) current = current.expression;
    else current = current.expression;
  }
  return current;
}

function detectColumn(property, sourceFile) {
  const logicalName = propertyName(property.name);
  const expressionText = property.initializer.getText(sourceFile);
  let physicalName = logicalName;
  let typeFactory = "unknown";
  let current = property.initializer;

  while (ts.isCallExpression(current) || ts.isPropertyAccessExpression(current)) {
    if (ts.isCallExpression(current)) {
      if (ts.isIdentifier(current.expression)) {
        typeFactory = current.expression.text;
        if (current.arguments[0] && ts.isStringLiteralLike(current.arguments[0])) {
          physicalName = current.arguments[0].text;
        }
      }
      current = current.expression;
    } else {
      current = current.expression;
    }
  }

  const referenceMatch = expressionText.match(/\.references\(\(\)\s*=>\s*([A-Za-z0-9_]+)\./);
  return {
    logicalName,
    physicalName,
    typeFactory,
    nullable: !/\.notNull\(\)/.test(expressionText),
    primaryKey: /\.primaryKey\(\)/.test(expressionText),
    unique: /\.unique\(\)/.test(expressionText),
    hasDefault: /\.default(?:Now)?\(/.test(expressionText),
    referencedSymbol: referenceMatch?.[1] ?? null,
    sourceLine: lineNumber(sourceFile, property.getStart(sourceFile)),
  };
}

function parseSchemaFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const declarations = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      if (!ts.isIdentifier(declaration.initializer.expression)) continue;
      const factory = declaration.initializer.expression.text;
      if (factory !== "mysqlTable" && factory !== "pgTable") continue;
      const [nameArgument, columnArgument] = declaration.initializer.arguments;
      if (!nameArgument || !ts.isStringLiteralLike(nameArgument) || !columnArgument || !ts.isObjectLiteralExpression(columnArgument)) continue;
      const columns = columnArgument.properties
        .filter((property) => ts.isPropertyAssignment(property))
        .map((property) => detectColumn(property, sourceFile));
      declarations.push({
        declarationId: `${relative(filePath)}:${lineNumber(sourceFile, declaration.getStart(sourceFile))}:${declaration.name.text}`,
        sourceFile: relative(filePath),
        sourceLine: lineNumber(sourceFile, declaration.getStart(sourceFile)),
        symbol: declaration.name.text,
        factory,
        dialect: factory === "mysqlTable" ? "mysql" : "postgresql",
        tableName: nameArgument.text,
        columns,
      });
    }
  }
  return declarations;
}

function isTestFile(filePath) {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(filePath.replaceAll(path.sep, "/"));
}

function collectTableFactoryCalls(files) {
  return files.flatMap((filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    return lines.flatMap((line, index) => {
      const matches = [...line.matchAll(/\b(mysqlTable|pgTable)\s*\(\s*["']([^"']+)["']/g)];
      return matches.map((match) => ({
        file: relative(filePath),
        line: index + 1,
        factory: match[1],
        tableName: match[2],
      }));
    });
  });
}

function resolveRelativeImport(importingFilePath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const basePath = path.resolve(path.dirname(importingFilePath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.mts`,
    `${basePath}.cts`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function collectRuntimeSchemaUsage(allDeclarations, productionFiles) {
  const sourceSymbols = new Map();
  for (const declaration of allDeclarations) {
    const sourcePath = path.resolve(repoRoot, declaration.sourceFile);
    if (!sourceSymbols.has(sourcePath)) sourceSymbols.set(sourcePath, new Set());
    sourceSymbols.get(sourcePath).add(declaration.symbol);
  }

  const usage = new Map();
  for (const [sourcePath, symbols] of sourceSymbols) {
    usage.set(sourcePath, new Map([...symbols].map((symbol) => [symbol, new Set()])));
  }

  for (const filePath of productionFiles) {
    const text = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
    const namedImports = new Map();
    const namespaceImports = new Map();

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
      const importedSource = resolveRelativeImport(filePath, statement.moduleSpecifier.text);
      if (!importedSource || !sourceSymbols.has(importedSource)) continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) {
        namespaceImports.set(bindings.name.text, importedSource);
      } else if (ts.isNamedImports(bindings)) {
        for (const imported of bindings.elements) {
          const importedName = imported.propertyName?.text ?? imported.name.text;
          if (sourceSymbols.get(importedSource).has(importedName)) {
            namedImports.set(imported.name.text, { sourcePath: importedSource, symbol: importedName });
          }
        }
      }
    }

    if (namedImports.size === 0 && namespaceImports.size === 0) continue;
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) return;
      if (ts.isIdentifier(node) && namedImports.has(node.text)) {
        const { sourcePath, symbol } = namedImports.get(node.text);
        usage.get(sourcePath).get(symbol).add(`${relative(filePath)}:${lineNumber(sourceFile, node.getStart(sourceFile))} [direct-schema-import]`);
      }
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaceImports.has(node.expression.text)) {
        const sourcePath = namespaceImports.get(node.expression.text);
        const symbol = node.name.text;
        if (sourceSymbols.get(sourcePath).has(symbol)) {
          usage.get(sourcePath).get(symbol).add(`${relative(filePath)}:${lineNumber(sourceFile, node.getStart(sourceFile))} [namespace-schema-import]`);
        }
      }
      ts.forEachChild(node, visit);
    };
    sourceFile.statements.forEach(visit);
  }

  return usage;
}

function sourceReferenceEvidence(declaration, runtimeUsage) {
  const schemaPath = path.resolve(repoRoot, declaration.sourceFile);
  return [...(runtimeUsage.get(schemaPath)?.get(declaration.symbol) ?? new Set())].sort();
}

function sqlObjectMentions(sqlText, tableName) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const anyPattern = new RegExp(`\\b${escaped}\\b`, "i");
  const createPattern = new RegExp("CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`?" + escaped + "`?", "i");
  return {
    mentions: anyPattern.test(sqlText),
    createsTable: createPattern.test(sqlText),
  };
}

function migrationClassification(filePath, journalTags) {
  const rel = relative(filePath);
  const basename = path.basename(filePath, ".sql");
  const rootNumbered = /^drizzle\/\d{4}_.+\.sql$/.test(rel);
  const isJournaled = journalTags.has(basename);
  if (rootNumbered && isJournaled) return "primary_registered";
  if (rootNumbered && !isJournaled) return "primary_journal_skipped";
  if (rel === "drizzle/rate-limit-tracking-schema.sql") return "manual_unregistered";
  if (rel.startsWith("drizzle/migrations/")) return "supplementary";
  if (rel.startsWith("drizzle/postgresql/")) return "postgresql_auxiliary";
  return "unclassified_sql_artifact";
}

function migrationRisk(filePath) {
  const basename = path.basename(filePath);
  if (basename === "0045_colossal_molecule_man.sql") return "Known partial replay risk: TEXT index lacks an explicit key prefix.";
  if (basename === "0058_claim_comments_extend.sql") return "Known replay risk: ALTER assumes non-existent userId physical column before later additions.";
  if (["0056_stage2_raw_ocr_text.sql", "0057_narrative_analysis_json.sql", "0058_claim_comments_extend.sql", "0059_kinga_ref_sequence.sql"].includes(basename)) return "Journal gap: this numbered migration is absent from the current Drizzle journal.";
  if (basename === "rate-limit-tracking-schema.sql") return "Manual, unnumbered, unjournaled schema artefact.";
  return null;
}

function decisionFor(declaration, allDeclarations, productionEvidence, migrationEvidence) {
  const sameName = allDeclarations.filter((item) => item.dialect === declaration.dialect && item.tableName === declaration.tableName);
  const duplicateOrdinal = sameName.sort((a, b) => a.declarationId.localeCompare(b.declarationId)).findIndex((item) => item.declarationId === declaration.declarationId) + 1;
  const isConfiguredPrimaryMySqlDeclaration = declaration.dialect === "mysql" && declaration.sourceFile === "drizzle/schema.ts";
  const repairReason = declaration.dialect === "mysql" ? knownRepairPrerequisites.get(declaration.tableName) : null;
  const directProductionReference = productionEvidence.length > 0;
  const hasCreateEvidence = migrationEvidence.some((item) => item.createsTable);
  const hasMigrationMention = migrationEvidence.length > 0;
  const gateCCandidateDisposition = gateCCandidateDispositions.get(declaration.tableName);

  if (declaration.dialect === "postgresql") {
    return {
      classification: "compatibility_legacy",
      basis: "PostgreSQL auxiliary schema declaration; current Drizzle configuration targets MySQL/TiDB, so it is not a TiDB staging baseline candidate without a separately approved architecture decision.",
      action: "Exclude from the TiDB baseline manifest; retain only as compatibility/alternate-schema evidence.",
    };
  }
  if (sameName.length > 1 && !isConfiguredPrimaryMySqlDeclaration) {
    return {
      classification: "superseded_duplicate",
      basis: `Supplementary declaration ${duplicateOrdinal}/${sameName.length} for a table also declared in the configured Drizzle schema entrypoint (${sameName.find((item) => item.sourceFile === "drizzle/schema.ts")?.declarationId ?? "drizzle/schema.ts"}).`,
      action: "Do not generate duplicate CREATE TABLE SQL from this supplementary declaration; retain the configured primary declaration as the candidate only if its own evidence-ledger classification supports it.",
    };
  }
  if (gateCCandidateDisposition) {
    if (gateCCandidateDisposition.status === "verified_current_path") {
      return {
        classification: "required_baseline",
        basis: `Gate C reviewed current-code-path evidence: ${gateCCandidateDisposition.operationalState} ${gateCCandidateDisposition.codePath.join("; ")}`,
        action: gateCCandidateDisposition.action,
        gateCCandidateVerification: gateCCandidateDisposition,
      };
    }
    return {
      classification: "active_but_ambiguous",
      basis: `Gate C reviewed hold: ${gateCCandidateDisposition.operationalState}`,
      action: gateCCandidateDisposition.action,
      gateCCandidateVerification: gateCCandidateDisposition,
    };
  }
  if (repairReason) {
    return {
      classification: "needs_migration_chain_repair_first",
      basis: repairReason,
      action: "Hold this table from automatic bootstrap generation until the migration-chain repair has a clean disposable replay and reviewer sign-off.",
    };
  }
  if (directProductionReference) {
    return {
      classification: "required_baseline",
      basis: `Direct non-test application-source reference(s) found at ${productionEvidence.slice(0, 3).join(", ")}${productionEvidence.length > 3 ? ` (+${productionEvidence.length - 3} more)` : ""}. This is an explicit runtime-code reason, not a default classification.`,
      action: hasCreateEvidence
        ? "Include only after the primary migration chain is replay-proven and the generated DDL matches the approved source manifest."
        : "Include only after the absence from the primary migration chain is reviewed and a generated CREATE TABLE batch passes scratch replay.",
    };
  }
  if (hasMigrationMention) {
    return {
      classification: "compatibility_legacy",
      basis: `No direct non-test application-source reference was found, while migration artefact reference(s) exist. This may be retained historical/compatibility schema rather than a first-staging baseline dependency.`,
      action: "Require product/data-owner confirmation before inclusion; do not create by default.",
    };
  }
  return {
    classification: "active_but_ambiguous",
    basis: "Declared in the current MySQL source contract but no direct non-test application-source or migration-file reference was found by the scripted trace.",
    action: "Do not include by default; obtain an owning team/product decision or document deprecation before baseline generation.",
  };
}

function markdownTable(rows, headers) {
  const escape = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escape(row[header])).join(" | ")} |`),
  ].join("\n");
}

const schemaFiles = walk(path.join(repoRoot, "drizzle"), (filePath) => /\.[cm]?[jt]sx?$/.test(filePath));
const allSchemaDeclarations = schemaFiles.flatMap(parseSchemaFile);
const mysqlDeclarations = allSchemaDeclarations.filter((entry) => entry.dialect === "mysql");
const postgresDeclarations = allSchemaDeclarations.filter((entry) => entry.dialect === "postgresql");
const mysqlDistinctNames = [...new Set(mysqlDeclarations.map((entry) => entry.tableName))].sort();
const productionFiles = sourceRoots.flatMap((root) => walk(path.join(repoRoot, root), (filePath) => /\.[cm]?[jt]sx?$/.test(filePath) && !isTestFile(filePath)));
const testFixtureFiles = sourceRoots.flatMap((root) => walk(path.join(repoRoot, root), (filePath) => /\.[cm]?[jt]sx?$/.test(filePath) && isTestFile(filePath)));
const testFixtureFactoryCalls = collectTableFactoryCalls(testFixtureFiles);
const runtimeSchemaUsage = collectRuntimeSchemaUsage(allSchemaDeclarations, productionFiles);

const journalPath = path.join(repoRoot, "drizzle", "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const journalTags = new Set(journal.entries.map((entry) => entry.tag));
const sqlFiles = walk(path.join(repoRoot, "drizzle"), (filePath) => filePath.endsWith(".sql"));
const migrations = sqlFiles.map((filePath) => {
  const sql = fs.readFileSync(filePath, "utf8");
  return {
    file: relative(filePath),
    sha256: sha256(sql),
    classification: migrationClassification(filePath, journalTags),
    journaled: journalTags.has(path.basename(filePath, ".sql")),
    statements: {
      createTable: (sql.match(/\bCREATE\s+TABLE\b/gi) ?? []).length,
      alterTable: (sql.match(/\bALTER\s+TABLE\b/gi) ?? []).length,
      dropTable: (sql.match(/\bDROP\s+TABLE\b/gi) ?? []).length,
      createIndex: (sql.match(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi) ?? []).length,
    },
    knownRisk: migrationRisk(filePath),
  };
});

const ledger = allSchemaDeclarations.map((declaration) => {
  const productionEvidence = sourceReferenceEvidence(declaration, runtimeSchemaUsage);
  const migrationEvidence = migrations
    .map((migration) => {
      const migrationPath = path.join(repoRoot, migration.file);
      const objectMentions = sqlObjectMentions(fs.readFileSync(migrationPath, "utf8"), declaration.tableName);
      return objectMentions.mentions ? { file: migration.file, createsTable: objectMentions.createsTable, classification: migration.classification } : null;
    })
    .filter(Boolean);
  const decision = decisionFor(declaration, allSchemaDeclarations, productionEvidence, migrationEvidence);
  return {
    ...declaration,
    duplicateDeclarationCount: allSchemaDeclarations.filter((item) => item.dialect === declaration.dialect && item.tableName === declaration.tableName).length,
    nonTestApplicationEvidence: productionEvidence,
    migrationEvidence,
    physicalNameDecision: physicalNameDecisions.get(declaration.tableName) ?? null,
    ...decision,
  };
});

const countBy = (items, field) => Object.fromEntries([...new Set(items.map((item) => item[field]))].sort().map((key) => [key, items.filter((item) => item[field] === key).length]));
const primaryMySqlDeclarations = mysqlDeclarations.filter((declaration) => declaration.sourceFile === "drizzle/schema.ts");
const primaryTableBySymbol = new Map(primaryMySqlDeclarations.map((declaration) => [declaration.symbol, declaration.tableName]));
const dependencyEntries = primaryMySqlDeclarations.map((declaration) => {
  const dependencySymbols = [...new Set(declaration.columns.map((column) => column.referencedSymbol).filter(Boolean))].sort();
  const dependencies = dependencySymbols.map((symbol) => ({
    symbol,
    tableName: primaryTableBySymbol.get(symbol) ?? null,
    resolution: primaryTableBySymbol.has(symbol) ? "resolved_to_configured_mysql_schema" : "unresolved_or_external_reference",
  }));
  return {
    declarationId: declaration.declarationId,
    tableName: declaration.tableName,
    sourceFile: declaration.sourceFile,
    sourceLine: declaration.sourceLine,
    dependencies,
  };
});
const dependencySummary = {
  configuredMySqlDeclarationsAnalysed: dependencyEntries.length,
  declarationsWithResolvedDependencies: dependencyEntries.filter((entry) => entry.dependencies.some((dependency) => dependency.resolution === "resolved_to_configured_mysql_schema")).length,
  resolvedDependencyEdges: dependencyEntries.flatMap((entry) => entry.dependencies).filter((dependency) => dependency.resolution === "resolved_to_configured_mysql_schema").length,
  unresolvedOrExternalReferences: dependencyEntries.flatMap((entry) => entry.dependencies).filter((dependency) => dependency.resolution === "unresolved_or_external_reference").length,
};
const manifestMetadata = {
  generatedAt: process.env.GENERATED_AT ?? new Date().toISOString(),
  sourceCommit: process.env.GIT_COMMIT ?? "resolved at execution time; see shell record",
  scope: "Repository-only static analysis. No database/environment connection or command is used.",
  counts: {
    schemaDeclarations: allSchemaDeclarations.length,
    mysqlDeclarations: mysqlDeclarations.length,
    mysqlDistinctPhysicalTableNames: mysqlDistinctNames.length,
    postgresqlDeclarations: postgresDeclarations.length,
    allDialectDistinctPhysicalTableNames: new Set(allSchemaDeclarations.map((entry) => entry.tableName)).size,
    testFixtureOnlyDeclarationsExcludedFromSchemaLedger: testFixtureFactoryCalls.length,
    allRepositoryTableFactoryDeclarationsIncludingTestFixtures: allSchemaDeclarations.length + testFixtureFactoryCalls.length,
    migrationSqlArtifacts: migrations.length,
    journalEntries: journal.entries.length,
  },
  checksums: {
    drizzleSchemaTs: sha256(fs.readFileSync(path.join(repoRoot, "drizzle", "schema.ts"), "utf8")),
    drizzleJournal: sha256(fs.readFileSync(journalPath, "utf8")),
    gateCRuntimeCandidateDispositions: sha256(fs.readFileSync(gateCDispositionsPath, "utf8")),
  },
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "source-schema-manifest.json.gz"), zlib.gzipSync(`${JSON.stringify({ metadata: manifestMetadata, declarations: allSchemaDeclarations, excludedTestFixtureFactoryCalls: testFixtureFactoryCalls }, null, 2)}\n`, { mtime: 0 }));
fs.writeFileSync(path.join(outputDir, "migration-artifact-manifest.json"), `${JSON.stringify({ metadata: manifestMetadata, journalEntries: journal.entries, migrations }, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "drift-decision-ledger.json.gz"), zlib.gzipSync(`${JSON.stringify({ metadata: manifestMetadata, classifications: countBy(ledger, "classification"), entries: ledger }, null, 2)}\n`, { mtime: 0 }));
fs.writeFileSync(path.join(outputDir, "foreign-key-dependency-manifest.json"), `${JSON.stringify({ metadata: manifestMetadata, summary: dependencySummary, entries: dependencyEntries }, null, 2)}\n`);

const summaryRows = Object.entries(countBy(ledger, "classification")).map(([classification, count]) => ({ Classification: classification, Declarations: count }));
const ledgerRows = ledger.map((entry) => ({
  Table: entry.tableName,
  Dialect: entry.dialect,
  Declaration: `${entry.sourceFile}:${entry.sourceLine}`,
  Classification: entry.classification,
  "Direct non-test evidence": entry.nonTestApplicationEvidence.slice(0, 2).join("; ") || "None found",
  "Migration evidence": entry.migrationEvidence.map((item) => `${item.file}${item.createsTable ? " (CREATE)" : ""}`).join("; ") || "None found",
  Basis: entry.basis,
  "Required next action": entry.action,
}));
const readme = `# KINGA Staging Schema Manifest Package\n\n` +
  `**Generated scope:** repository-only static analysis. No environment connection, DDL, migration command, schema change, data read, or production action occurred.\n\n` +
  `## Count reconciliation\n\n` +
  markdownTable([
    { Metric: "MySQL/TiDB source declarations", Value: manifestMetadata.counts.mysqlDeclarations },
    { Metric: "Distinct MySQL/TiDB physical table names", Value: manifestMetadata.counts.mysqlDistinctPhysicalTableNames },
    { Metric: "PostgreSQL auxiliary source declarations", Value: manifestMetadata.counts.postgresqlDeclarations },
    { Metric: "All production schema declarations across dialects", Value: manifestMetadata.counts.schemaDeclarations },
    { Metric: "Test-only factory declarations excluded from schema ledger", Value: manifestMetadata.counts.testFixtureOnlyDeclarationsExcludedFromSchemaLedger },
    { Metric: "All repository factory declarations including test fixtures", Value: manifestMetadata.counts.allRepositoryTableFactoryDeclarationsIncludingTestFixtures },
    { Metric: "SQL migration artefacts", Value: manifestMetadata.counts.migrationSqlArtifacts },
    { Metric: "Registered journal entries", Value: manifestMetadata.counts.journalEntries },
  ], ["Metric", "Value"]) +
  `\n\nThe earlier figure of **254 source tables is not reproducible from current GitHub main**. This package records the exact static universe instead: ${manifestMetadata.counts.mysqlDeclarations} MySQL declarations (${manifestMetadata.counts.mysqlDistinctPhysicalTableNames} distinct physical names), ${manifestMetadata.counts.postgresqlDeclarations} PostgreSQL auxiliary declarations, and ${manifestMetadata.counts.testFixtureOnlyDeclarationsExcludedFromSchemaLedger} test-only factory declarations excluded from the production schema ledger. The count difference must be reconciled before it is used as a delivery target; it is not silently rounded or fabricated.\n\n` +
  `## Provisional evidence-ledger classification\n\n` +
  markdownTable(summaryRows, ["Classification", "Declarations"]) +
  `\n\nThe classification is deliberately conservative. A MySQL declaration is classified **required_baseline** only where the trace found direct non-test application-source evidence or a separately recorded Gate C current-code-path review. No object is marked required merely because it appears in a schema file or because a provisional table list says it may be needed. PostgreSQL alternate-schema entries are excluded from TiDB baseline scope. Duplicate declarations are held until an owner selects the authoritative declaration. The five specifically known migration-chain cases remain held from automatic bootstrap until their reviewed path is incorporated in a later Gate C wave.\n\n` +
  `## Gate C candidate verification\n\n` +
  markdownTable(gateCDispositions.candidateTables.map((entry) => ({ Table: entry.tableName, Status: entry.status, "Operational state": entry.operationalState, Action: entry.action })), ["Table", "Status", "Operational state", "Action"]) +
  `\n\n## Approved physical-name decisions\n\n` +
  markdownTable(gateCDispositions.physicalNameDecisions.map((entry) => ({ Table: entry.tableName, Column: entry.columnName, Status: entry.status, Basis: entry.basis, Action: entry.action })), ["Table", "Column", "Status", "Basis", "Action"]) +
  `\n\n` +
  `## Dependency inventory\n\n` +
  "The generated `foreign-key-dependency-manifest.json` covers " + dependencySummary.configuredMySqlDeclarationsAnalysed + " configured MySQL schema declarations, with " + dependencySummary.resolvedDependencyEdges + " resolved configured-schema foreign-key edges and " + dependencySummary.unresolvedOrExternalReferences + " unresolved/external-reference candidate(s). It is a sequencing aid; every generated SQL foreign key must still be checked against the approved source manifest and actual scratch metadata.\n\n" +
  `## Full ledger\n\n` + markdownTable(ledgerRows, ["Table", "Dialect", "Declaration", "Classification", "Direct non-test evidence", "Migration evidence", "Basis", "Required next action"]) + `\n`;
fs.writeFileSync(path.join(outputDir, "README.md"), readme);

console.log(JSON.stringify({ outputDir: relative(outputDir), ...manifestMetadata }, null, 2));
