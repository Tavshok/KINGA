import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const routersRelativePath = "server/routers.ts";
const clientTrpcRelativePath = "client/src/lib/trpc.ts";

// These exact source declarations are the established helpers that throw or
// build the canonical hold without always returning a literal object locally.
// New helpers are detected by their semantic return shape below; a same-named
// local decoy is never trusted.
const canonicalHelperOrigins = new Map([
  [
    "shared/p0FraudDecisionHoldPresentation.ts",
    new Set(["buildP0B1FraudDecisionHold"]),
  ],
  [
    "server/evidence-governance/p0FraudDecisionHold.ts",
    new Set(["throwP0B1FraudDecisionHold"]),
  ],
  ["server/routers/claims-core.ts", new Set(["buildP0B1FraudOutputHold"])],
  ["server/routers/claim-replay.ts", new Set(["buildReplayP0B1Hold"])],
  [
    "server/pipeline-v2/decisionTraceGenerator.ts",
    new Set(["buildP0B1DecisionTraceHold"]),
  ],
  [
    "server/routers/ai-assessments-core.ts",
    new Set(["projectP0B1AssessmentHold"]),
  ],
]);

export const manifestRelativePath =
  "scripts/ci/p0-b1-typed-hold-consumer-manifest.json";

function canonicalPath(path) {
  return path.split(sep).join("/");
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(property) {
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
    ? property.name.text
    : null;
}

function isCanonicalFraudHoldType(type, checker, node) {
  // A hold can be direct or nested inside a large inferred object. Rendering
  // the complete compiler type is more conservative than following only
  // immediate properties: a new nested canonical status must be inventoried.
  return checker
    .typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
    .includes('"FRAUD_DECISION_WITHHELD"');
}

function elementName(expression) {
  const candidate = unwrap(expression);
  return ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate)
    ? candidate.text
    : null;
}

function declarationName(declaration) {
  if (
    (ts.isFunctionDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isTypeAliasDeclaration(declaration) ||
      ts.isClassDeclaration(declaration)) &&
    declaration.name &&
    ts.isIdentifier(declaration.name)
  ) {
    return declaration.name.text;
  }
  return null;
}

function resolveAliasedSymbol(symbol, checker) {
  return symbol?.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function symbolDeclaration(symbol, checker) {
  const resolved = resolveAliasedSymbol(symbol, checker);
  return resolved?.valueDeclaration ?? resolved?.declarations?.[0] ?? null;
}

function hasExportModifier(node) {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined;
  return Boolean(
    modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function directVariableDeclaration(sourceFile, name) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
        return { declaration, exported: hasExportModifier(statement) };
      }
    }
  }
  return null;
}

function directTypeAlias(sourceFile, name) {
  const aliases = sourceFile.statements.filter(
    statement =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === name &&
      hasExportModifier(statement)
  );
  return aliases.length === 1 ? aliases[0] : null;
}

function resolveObjectLiteral(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return null;
  seen.add(candidate);

  if (ts.isObjectLiteralExpression(candidate)) return candidate;
  if (ts.isCallExpression(candidate)) {
    return candidate.arguments.find(ts.isObjectLiteralExpression) ?? null;
  }
  if (!ts.isIdentifier(candidate)) return null;

  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(candidate),
    checker
  );
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return resolveObjectLiteral(declaration.initializer, checker, seen);
  }
  return null;
}

function directNamedProperty(object, name) {
  const matches = object.properties.filter(
    property =>
      ts.isPropertyAssignment(property) && propertyName(property) === name
  );
  return matches.length === 1 ? matches[0] : null;
}

function canonicalHelperSymbol(symbol, checker, root) {
  const declaration = symbolDeclaration(symbol, checker);
  if (!declaration) return false;
  const origin = canonicalPath(
    relative(root, declaration.getSourceFile().fileName)
  );
  const helpers = canonicalHelperOrigins.get(origin);
  return Boolean(helpers?.has(declarationName(declaration)));
}

function objectContainsCanonicalStatus(expression, checker, root, seen) {
  const candidate = unwrap(expression);
  if (!ts.isObjectLiteralExpression(candidate)) return false;
  for (const property of candidate.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (
        expressionProducesCanonicalHold(
          property.expression,
          checker,
          root,
          seen
        )
      ) {
        return true;
      }
      continue;
    }
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property);
    const value = unwrap(property.initializer);
    if (
      name === "status" &&
      (ts.isStringLiteral(value) ||
        ts.isNoSubstitutionTemplateLiteral(value)) &&
      value.text === "FRAUD_DECISION_WITHHELD"
    ) {
      return true;
    }
    if (
      (name === "fraudDecision" || name === "decision_hold") &&
      expressionProducesCanonicalHold(value, checker, root, seen)
    ) {
      return true;
    }
  }
  return false;
}

function declarationProducesCanonicalHold(declaration, checker, root, seen) {
  if (seen.has(declaration)) return false;
  seen.add(declaration);

  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return expressionProducesCanonicalHold(
      declaration.initializer,
      checker,
      root,
      seen
    );
  }
  if (ts.isPropertyAssignment(declaration)) {
    return expressionProducesCanonicalHold(
      declaration.initializer,
      checker,
      root,
      seen
    );
  }
  if (
    (ts.isFunctionDeclaration(declaration) ||
      ts.isFunctionExpression(declaration) ||
      ts.isArrowFunction(declaration) ||
      ts.isMethodDeclaration(declaration)) &&
    declaration.body
  ) {
    if (!ts.isBlock(declaration.body)) {
      return expressionProducesCanonicalHold(
        declaration.body,
        checker,
        root,
        seen
      );
    }
    return blockProducesCanonicalHold(declaration.body, checker, root, seen);
  }
  return false;
}

function expressionProducesCanonicalHold(
  expression,
  checker,
  root,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);

  if (objectContainsCanonicalStatus(candidate, checker, root, seen))
    return true;

  if (
    ts.isFunctionExpression(candidate) ||
    ts.isArrowFunction(candidate) ||
    ts.isFunctionDeclaration(candidate) ||
    ts.isMethodDeclaration(candidate)
  ) {
    const callbackSeen = new Set(seen);
    callbackSeen.delete(candidate);
    return declarationProducesCanonicalHold(
      candidate,
      checker,
      root,
      callbackSeen
    );
  }

  if (ts.isIdentifier(candidate)) {
    const symbol = checker.getSymbolAtLocation(candidate);
    if (canonicalHelperSymbol(symbol, checker, root)) return true;
    const declaration = symbolDeclaration(symbol, checker);
    return declaration
      ? declarationProducesCanonicalHold(declaration, checker, root, seen)
      : false;
  }

  if (ts.isPropertyAccessExpression(candidate)) {
    const symbol = checker.getSymbolAtLocation(candidate.name);
    if (canonicalHelperSymbol(symbol, checker, root)) return true;
    const declaration = symbolDeclaration(symbol, checker);
    return declaration
      ? declarationProducesCanonicalHold(declaration, checker, root, seen)
      : false;
  }

  if (ts.isCallExpression(candidate) || ts.isNewExpression(candidate)) {
    const symbol = checker.getSymbolAtLocation(candidate.expression);
    if (canonicalHelperSymbol(symbol, checker, root)) return true;
    const declaration = symbolDeclaration(symbol, checker);
    if (
      declaration &&
      declarationProducesCanonicalHold(declaration, checker, root, seen)
    ) {
      return true;
    }
    // Promise.resolve and equivalent wrappers do not change the actual value.
    return candidate.arguments?.some(argument =>
      expressionProducesCanonicalHold(argument, checker, root, seen)
    );
  }

  if (ts.isConditionalExpression(candidate)) {
    return (
      expressionProducesCanonicalHold(
        candidate.whenTrue,
        checker,
        root,
        seen
      ) ||
      expressionProducesCanonicalHold(candidate.whenFalse, checker, root, seen)
    );
  }

  return false;
}

function blockProducesCanonicalHold(block, checker, root, seen = new Set()) {
  let found = false;
  const visit = node => {
    if (found) return;
    if (
      node !== block &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    if (
      (ts.isReturnStatement(node) || ts.isThrowStatement(node)) &&
      node.expression &&
      expressionProducesCanonicalHold(node.expression, checker, root, seen)
    ) {
      found = true;
      return;
    }
    if (
      ts.isExpressionStatement(node) &&
      expressionProducesCanonicalHold(node.expression, checker, root, seen)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(block);
  return found;
}

function assertExportedAppRouter(program, root) {
  const checker = program.getTypeChecker();
  const routers = program.getSourceFile(resolve(root, routersRelativePath));
  if (!routers) {
    throw new Error(`${routersRelativePath}: source is missing from tsconfig.`);
  }

  const appRouterBinding = directVariableDeclaration(routers, "appRouter");
  if (
    !appRouterBinding?.exported ||
    !appRouterBinding.declaration.initializer
  ) {
    throw new Error(
      `${routersRelativePath}: appRouter must be exactly one exported variable declaration.`
    );
  }
  const appRouterSymbol = checker.getSymbolAtLocation(
    appRouterBinding.declaration.name
  );
  const appRouter = resolveObjectLiteral(
    appRouterBinding.declaration.initializer,
    checker
  );
  if (!appRouter || !appRouterSymbol) {
    throw new Error(
      `${routersRelativePath}: exported appRouter is unresolvable.`
    );
  }

  const appRouterAlias = directTypeAlias(routers, "AppRouter");
  if (!appRouterAlias || !ts.isTypeQueryNode(appRouterAlias.type)) {
    throw new Error(
      `${routersRelativePath}: exported AppRouter must remain a typeof appRouter type alias.`
    );
  }
  const appRouterTypeSymbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(appRouterAlias.type.exprName),
    checker
  );
  if (appRouterTypeSymbol !== appRouterSymbol) {
    throw new Error(
      `${routersRelativePath}: exported AppRouter must reference the exported appRouter binding.`
    );
  }

  return { checker, appRouter, appRouterSymbol, appRouterAlias, routers };
}

function assertClientUsesAppRouter(
  program,
  root,
  appRouterSymbol,
  appRouterAlias
) {
  const checker = program.getTypeChecker();
  const trpcSource = program.getSourceFile(
    resolve(root, clientTrpcRelativePath)
  );
  if (!trpcSource) {
    throw new Error(
      `${clientTrpcRelativePath}: source is missing from tsconfig.`
    );
  }
  const trpcBinding = directVariableDeclaration(trpcSource, "trpc");
  if (!trpcBinding?.exported || !trpcBinding.declaration.initializer) {
    throw new Error(
      `${clientTrpcRelativePath}: trpc must be exactly one exported variable declaration.`
    );
  }
  const trpcCall = unwrap(trpcBinding.declaration.initializer);
  if (!ts.isCallExpression(trpcCall) || trpcCall.typeArguments?.length !== 1) {
    throw new Error(
      `${clientTrpcRelativePath}: trpc must use createTRPCReact<AppRouter>().`
    );
  }
  const appRouterType = trpcCall.typeArguments[0];
  if (!ts.isTypeReferenceNode(appRouterType)) {
    throw new Error(
      `${clientTrpcRelativePath}: trpc must use the exported AppRouter type reference.`
    );
  }
  const aliasSymbol = checker.getSymbolAtLocation(appRouterType.typeName);
  const aliasDeclaration = symbolDeclaration(aliasSymbol, checker);
  if (!ts.isTypeAliasDeclaration(aliasDeclaration)) {
    throw new Error(
      `${clientTrpcRelativePath}: AppRouter type import is unresolvable.`
    );
  }
  if (aliasDeclaration !== appRouterAlias) {
    throw new Error(
      `${clientTrpcRelativePath}: trpc must import the exact exported AppRouter alias from ${routersRelativePath}.`
    );
  }
  const aliasedRouterSymbol = resolveAliasedSymbol(
    checker.getSymbolAtLocation(aliasDeclaration.type.exprName),
    checker
  );
  if (aliasedRouterSymbol !== appRouterSymbol) {
    throw new Error(
      `${clientTrpcRelativePath}: trpc AppRouter type must resolve to the exported server appRouter.`
    );
  }

  const trpcSymbol = checker.getSymbolAtLocation(trpcBinding.declaration.name);
  if (!trpcSymbol) {
    throw new Error(
      `${clientTrpcRelativePath}: exported trpc symbol is unresolvable.`
    );
  }
  return { checker, trpcSymbol };
}

function serverProcedureMap(program, root = repositoryRoot) {
  const { checker, appRouter } = assertExportedAppRouter(program, root);
  const procedures = new Map();
  for (const namespaceProperty of appRouter.properties) {
    if (!ts.isPropertyAssignment(namespaceProperty)) continue;
    const namespace = propertyName(namespaceProperty);
    if (!namespace) continue;
    const router = resolveObjectLiteral(namespaceProperty.initializer, checker);
    if (!router) continue;

    for (const procedureProperty of router.properties) {
      if (!ts.isPropertyAssignment(procedureProperty)) continue;
      const procedure = propertyName(procedureProperty);
      if (!procedure) continue;
      if (
        expressionProducesCanonicalHold(
          procedureProperty.initializer,
          checker,
          root
        )
      ) {
        procedures.set(`${namespace}.${procedure}`, procedureProperty);
      }
    }
  }
  return procedures;
}

function hookKind(name) {
  if (name === "useQuery") return "query";
  if (name === "useMutation") return "mutation";
  return null;
}

function expressionRootsAtTrpc(
  expression,
  checker,
  trpcSymbol,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);
  if (ts.isIdentifier(candidate)) {
    const symbol = resolveAliasedSymbol(
      checker.getSymbolAtLocation(candidate),
      checker
    );
    if (symbol === trpcSymbol) return true;
    const declaration = symbolDeclaration(symbol, checker);
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const bindingDeclaration = pattern?.parent;
      return Boolean(
        (ts.isObjectBindingPattern(pattern) ||
          ts.isArrayBindingPattern(pattern)) &&
          ts.isVariableDeclaration(bindingDeclaration) &&
          bindingDeclaration.initializer &&
          expressionRootsAtTrpc(
            bindingDeclaration.initializer,
            checker,
            trpcSymbol,
            seen
          )
      );
    }
    return Boolean(
      ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        expressionRootsAtTrpc(
          declaration.initializer,
          checker,
          trpcSymbol,
          seen
        )
    );
  }
  if (ts.isBindingElement(candidate)) {
    const pattern = candidate.parent;
    const declaration = pattern?.parent;
    if (
      (ts.isObjectBindingPattern(pattern) ||
        ts.isArrayBindingPattern(pattern)) &&
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer
    ) {
      return expressionRootsAtTrpc(
        declaration.initializer,
        checker,
        trpcSymbol,
        seen
      );
    }
  }
  const access = memberAccess(candidate);
  if (access) {
    return expressionRootsAtTrpc(access.object, checker, trpcSymbol, seen);
  }
  return false;
}

function memberAccess(expression) {
  const candidate = unwrap(expression);
  if (ts.isPropertyAccessExpression(candidate)) {
    return { object: candidate.expression, name: candidate.name.text };
  }
  if (ts.isElementAccessExpression(candidate)) {
    return {
      object: candidate.expression,
      name: elementName(candidate.argumentExpression),
    };
  }
  return null;
}

function procedureKeyFromClientHook(node, checker, trpcSymbol) {
  const hook = memberAccess(node.expression);
  if (!hook) return null;
  const kind = hookKind(hook.name);
  if (!kind) return null;

  const procedure = memberAccess(hook.object);
  const namespace = procedure && memberAccess(procedure.object);
  if (!procedure?.name || !namespace?.name) return null;
  if (!expressionRootsAtTrpc(namespace.object, checker, trpcSymbol))
    return null;

  return {
    kind,
    procedureKey: `${namespace.name}.${procedure.name}`,
    callee: `trpc.${namespace.name}.${procedure.name}.${hook.name}`,
  };
}

function containsPotentialTrpcHook(node, checker, trpcSymbol) {
  if (!ts.isCallExpression(node)) return false;
  const hook = memberAccess(node.expression);
  if (!hook || !hookKind(hook.name)) return false;
  let base = hook.object;
  while (memberAccess(base)) base = memberAccess(base).object;
  return expressionRootsAtTrpc(base, checker, trpcSymbol);
}

function detectionLabel(typeMatch, serverMatch) {
  if (typeMatch && serverMatch) return "typed-and-server";
  if (serverMatch) return "server-canonical-hold";
  return "typed-canonical-hold";
}

function callDataType(node, checker) {
  const resultType = checker.getTypeAtLocation(node);
  const data = checker.getPropertyOfType(resultType, "data");
  if (!data) return null;
  return checker.getTypeOfSymbolAtLocation(data, node);
}

export function scanTypedFraudHoldConsumers(program, root = repositoryRoot) {
  const { appRouterSymbol, appRouterAlias } = assertExportedAppRouter(
    program,
    root
  );
  const { checker, trpcSymbol } = assertClientUsesAppRouter(
    program,
    root,
    appRouterSymbol,
    appRouterAlias
  );
  const procedureMap = serverProcedureMap(program, root);
  const clientRoot = `${resolve(root, "client/src")}${sep}`;
  const consumers = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (
      !sourceFile.fileName.startsWith(clientRoot) ||
      !/\.tsx?$/.test(sourceFile.fileName) ||
      sourceFile.isDeclarationFile
    ) {
      continue;
    }

    const visit = node => {
      if (ts.isCallExpression(node)) {
        const identity = procedureKeyFromClientHook(node, checker, trpcSymbol);
        if (identity) {
          const dataType = callDataType(node, checker);
          const typeMatch = Boolean(
            dataType && isCanonicalFraudHoldType(dataType, checker, node)
          );
          const serverMatch = procedureMap.has(identity.procedureKey);
          if (typeMatch || serverMatch) {
            const position = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            );
            const entry = {
              path: canonicalPath(relative(root, sourceFile.fileName)),
              line: position.line + 1,
              column: position.character + 1,
              kind: identity.kind,
              callee: identity.callee,
              detection: detectionLabel(typeMatch, serverMatch),
            };
            consumers.push({
              ...entry,
              fingerprint: fingerprintHoldConsumer(entry),
            });
          }
        } else if (containsPotentialTrpcHook(node, checker, trpcSymbol)) {
          throw new Error(
            `${canonicalPath(relative(root, sourceFile.fileName))}:${sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1}: a tRPC useQuery/useMutation hook must use a literal namespace and procedure key so P0-B1 hold discovery cannot be bypassed.`
          );
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return consumers.sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint)
  );
}

export function createProgramForRepository(root = repositoryRoot) {
  const configPath = ts.findConfigFile(
    root,
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) {
    throw new Error(`${root}: tsconfig.json is missing.`);
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      `${configPath}: ${ts.flattenDiagnosticMessageText(config.error.messageText, " ")}`
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath)
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      `${configPath}: ${parsed.errors
        .map(error => ts.flattenDiagnosticMessageText(error.messageText, " "))
        .join("; ")}`
    );
  }
  return ts.createProgram(parsed.fileNames, parsed.options);
}

export function fingerprintHoldConsumer(entry) {
  const payload = [
    entry.path,
    String(entry.line),
    String(entry.column),
    entry.kind,
    entry.callee,
    entry.detection,
  ].join("\u0000");
  return createHash("sha256").update(payload).digest("hex");
}

function canonicalManifestEntry(entry) {
  return {
    path: entry.path,
    line: entry.line,
    column: entry.column,
    kind: entry.kind,
    callee: entry.callee,
    detection: entry.detection,
    fingerprint: entry.fingerprint,
  };
}

const manifestEntryFields = new Set([
  "path",
  "line",
  "column",
  "kind",
  "callee",
  "detection",
  "fingerprint",
]);

const detectionModes = new Set([
  "typed-and-server",
  "server-canonical-hold",
  "typed-canonical-hold",
]);

function exactManifestMap(entries, label) {
  if (!Array.isArray(entries)) {
    throw new Error(`P0-B1 ${label} consumer inventory must be an array.`);
  }
  const map = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `P0-B1 ${label} consumer inventory contains a non-object entry.`
      );
    }
    const keys = Object.keys(entry).sort();
    if (
      keys.length !== manifestEntryFields.size ||
      keys.some(key => !manifestEntryFields.has(key))
    ) {
      throw new Error(
        `P0-B1 ${label} consumer inventory entry must contain exactly the approved fingerprint fields.`
      );
    }
    if (
      typeof entry.path !== "string" ||
      !entry.path ||
      !Number.isSafeInteger(entry.line) ||
      entry.line < 1 ||
      !Number.isSafeInteger(entry.column) ||
      entry.column < 1 ||
      (entry.kind !== "query" && entry.kind !== "mutation") ||
      typeof entry.callee !== "string" ||
      !entry.callee ||
      !detectionModes.has(entry.detection) ||
      typeof entry.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.fingerprint)
    ) {
      throw new Error(
        `P0-B1 ${label} consumer inventory entry has an invalid exact fingerprint shape.`
      );
    }
    const canonical = canonicalManifestEntry(entry);
    const recomputed = fingerprintHoldConsumer(canonical);
    if (canonical.fingerprint !== recomputed) {
      throw new Error(
        `P0-B1 ${label} consumer inventory fingerprint does not match its path, location, kind, callee, and detection fields.`
      );
    }
    if (map.has(canonical.fingerprint)) {
      throw new Error(
        `P0-B1 ${label} consumer inventory contains a duplicate exact fingerprint.`
      );
    }
    map.set(canonical.fingerprint, canonical);
  }
  return map;
}

export function compareExactHoldConsumerManifest(actual, expected) {
  const actualByFingerprint = exactManifestMap(actual, "generated");
  const expectedByFingerprint = exactManifestMap(expected, "committed");
  const missing = [...expectedByFingerprint.values()].filter(
    entry => !actualByFingerprint.has(entry.fingerprint)
  );
  const unexpected = [...actualByFingerprint.values()].filter(
    entry => !expectedByFingerprint.has(entry.fingerprint)
  );

  if (missing.length === 0 && unexpected.length === 0) return;

  const lines = [
    "P0-B1 fraud-hold client-consumer inventory drift detected.",
    "Every client tRPC hook whose typed data or resolved server procedure can produce FRAUD_DECISION_WITHHELD must retain its exact approved fingerprint.",
  ];
  for (const entry of missing) {
    lines.push(
      `- missing or moved approved consumer: ${entry.path}:${entry.line}:${entry.column} ${entry.callee} (${entry.kind}; ${entry.detection}; ${entry.fingerprint})`
    );
  }
  for (const entry of unexpected) {
    lines.push(
      `- unreviewed consumer: ${entry.path}:${entry.line}:${entry.column} ${entry.callee} (${entry.kind}; ${entry.detection}; ${entry.fingerprint})`
    );
  }
  throw new Error(lines.join("\n"));
}

export async function verifyTypedFraudHoldConsumerManifest(
  root = repositoryRoot,
  manifest = null
) {
  const expected =
    manifest ??
    JSON.parse(await readFile(resolve(root, manifestRelativePath), "utf8"));
  if (!Array.isArray(expected)) {
    throw new Error(
      `${manifestRelativePath}: expected an array of exact fingerprints.`
    );
  }
  const actual = scanTypedFraudHoldConsumers(
    createProgramForRepository(root),
    root
  );
  compareExactHoldConsumerManifest(actual, expected);
  return actual;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const consumers = await verifyTypedFraudHoldConsumerManifest();
  console.log(
    `P0-B1 fraud-hold client-consumer inventory verified for ${consumers.length} exact client hook fingerprints.`
  );
}
