import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const routersRelativePath = "server/routers.ts";
export const manifestRelativePath =
  "scripts/ci/p0-b1-raw-fraud-emission-manifest.json";

/**
 * Stored fraud evidence may be read internally only when it does not cross a
 * tRPC procedure's public output boundary. This list names fields that are
 * raw fraud evidence, classification, or derived fraud numerics—not a
 * canonical P0-B1 hold and not an actionable-abstention presentation.
 */
export const P0_B1_RAW_FRAUD_FIELD_NAMES = Object.freeze([
  "aiFraudScore",
  "earlyFraudSuspicion",
  "finalFraudOutcome",
  "fraudEvidence",
  "fraudFlags",
  "fraudIndicators",
  "fraudProbabilityScore",
  "fraudRiskLevel",
  "fraudRiskScore",
  "fraudScore",
  "fraudScoreBreakdownJson",
  "isFraudConfirmed",
  "overallFraudScore",
]);

const rawFieldNames = new Set(P0_B1_RAW_FRAUD_FIELD_NAMES);
const rawSqlFieldNames = Object.freeze(
  P0_B1_RAW_FRAUD_FIELD_NAMES.map(name =>
    name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  )
);

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

const trustedProcedureBuilderOrigins = new Map([
  [
    "server/_core/trpc.ts",
    new Set([
      "publicProcedure",
      "executiveReportAuthorityProcedure",
      "protectedProcedure",
      "adminProcedure",
      "superAdminProcedure",
      "executiveOnlyProcedure",
      "insurerDomainProcedure",
    ]),
  ],
  [
    "server/_core/domain-middleware.ts",
    new Set([
      "platformProcedure",
      "agencyDomainProcedure",
      "insurerDomainProcedure",
      "insurerTenantProcedure",
      "fleetDomainProcedure",
      "marketplaceDomainProcedure",
      "portalDomainProcedure",
      "customerDomainProcedure",
      "engineerDomainProcedure",
    ]),
  ],
]);
const trustedProcedureBuilderMethods = new Set(["input", "use"]);

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

function resolveAliasedSymbol(symbol, checker) {
  return symbol?.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function symbolDeclaration(symbol, checker) {
  const resolved = resolveAliasedSymbol(symbol, checker);
  return resolved?.valueDeclaration ?? resolved?.declarations?.[0] ?? null;
}

function declarationName(declaration) {
  if (
    (ts.isFunctionDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration) ||
      ts.isClassDeclaration(declaration)) &&
    declaration.name &&
    ts.isIdentifier(declaration.name)
  ) {
    return declaration.name.text;
  }
  return null;
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

function isTrustedRouterFactory(expression, checker, root) {
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(expression),
    checker
  );
  return Boolean(
    declaration &&
      canonicalPath(relative(root, declaration.getSourceFile().fileName)) ===
        "server/_core/trpc.ts" &&
      declarationName(declaration) === "router"
  );
}

function resolveRouterObjectLiteral(
  expression,
  checker,
  root,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return null;
  seen.add(candidate);

  if (ts.isObjectLiteralExpression(candidate)) return candidate;
  if (ts.isCallExpression(candidate)) {
    if (!isTrustedRouterFactory(candidate.expression, checker, root))
      return null;
    return candidate.arguments.length === 1 &&
      ts.isObjectLiteralExpression(candidate.arguments[0])
      ? candidate.arguments[0]
      : null;
  }
  if (!ts.isIdentifier(candidate)) return null;

  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(candidate),
    checker
  );
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return resolveRouterObjectLiteral(
      declaration.initializer,
      checker,
      root,
      seen
    );
  }
  return null;
}

function routerPropertyName(property) {
  if (ts.isPropertyAssignment(property)) return propertyName(property);
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return null;
}

function shorthandValueDeclaration(property, checker) {
  if (!ts.isShorthandPropertyAssignment(property)) return null;
  return symbolDeclaration(
    checker.getShorthandAssignmentValueSymbol(property),
    checker
  );
}

function routerObjectForProperty(property, checker, root) {
  if (ts.isPropertyAssignment(property)) {
    return resolveRouterObjectLiteral(property.initializer, checker, root);
  }
  const declaration = shorthandValueDeclaration(property, checker);
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return resolveRouterObjectLiteral(declaration.initializer, checker, root);
  }
  return null;
}

function procedureValueExpression(property, checker) {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  const declaration = shorthandValueDeclaration(property, checker);
  if (ts.isVariableDeclaration(declaration))
    return declaration.initializer ?? null;
  return null;
}

function isTrustedProcedureDeclaration(declaration, root) {
  if (!declaration) return false;
  const origin = canonicalPath(
    relative(root, declaration.getSourceFile().fileName)
  );
  return Boolean(
    trustedProcedureBuilderOrigins
      .get(origin)
      ?.has(declarationName(declaration))
  );
}

function isTrustedProcedureBuilder(
  expression,
  checker,
  root,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);

  if (ts.isIdentifier(candidate)) {
    const declaration = symbolDeclaration(
      checker.getSymbolAtLocation(candidate),
      checker
    );
    if (isTrustedProcedureDeclaration(declaration, root)) return true;
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return isTrustedProcedureBuilder(
        declaration.initializer,
        checker,
        root,
        seen
      );
    }
    return false;
  }

  if (ts.isCallExpression(candidate)) {
    const callee = unwrap(candidate.expression);
    return (
      ts.isPropertyAccessExpression(callee) &&
      trustedProcedureBuilderMethods.has(callee.name.text) &&
      isTrustedProcedureBuilder(callee.expression, checker, root, seen)
    );
  }
  return false;
}

function resolveProcedureExpression(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return null;
  seen.add(candidate);
  if (ts.isCallExpression(candidate)) return candidate;
  if (!ts.isIdentifier(candidate)) return null;
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(candidate),
    checker
  );
  if (
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer
  ) {
    return resolveProcedureExpression(declaration.initializer, checker, seen);
  }
  return null;
}

function procedureCallback(expression, checker, root) {
  const candidate = resolveProcedureExpression(expression, checker);
  if (!candidate || !ts.isCallExpression(candidate)) return null;
  const callee = unwrap(candidate.expression);
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !["query", "mutation", "subscription"].includes(callee.name.text) ||
    !isTrustedProcedureBuilder(callee.expression, checker, root)
  ) {
    return null;
  }
  const callbacks = candidate.arguments.filter(
    argument =>
      ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
  );
  return callbacks.length === 1 ? callbacks[0] : null;
}

function canonicalHelperSymbol(symbol, checker, root) {
  const declaration = symbolDeclaration(symbol, checker);
  if (!declaration) return false;
  const origin = canonicalPath(
    relative(root, declaration.getSourceFile().fileName)
  );
  return Boolean(
    canonicalHelperOrigins.get(origin)?.has(declarationName(declaration))
  );
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

  if (ts.isIdentifier(candidate) || ts.isPropertyAccessExpression(candidate)) {
    const symbol = checker.getSymbolAtLocation(
      ts.isPropertyAccessExpression(candidate) ? candidate.name : candidate
    );
    if (canonicalHelperSymbol(symbol, checker, root)) return true;
    const declaration = symbolDeclaration(symbol, checker);
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return expressionProducesCanonicalHold(
        declaration.initializer,
        checker,
        root,
        seen
      );
    }
  }

  if (ts.isCallExpression(candidate)) {
    const symbol = checker.getSymbolAtLocation(candidate.expression);
    if (canonicalHelperSymbol(symbol, checker, root)) return true;
  }
  return false;
}

function unwrapContainerType(type, checker) {
  const awaited = checker.getAwaitedType?.(type);
  if (awaited) type = awaited;
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return checker.getTypeArguments(type)[0] ?? type;
  }
  return type;
}

function rawFieldsInType(
  type,
  checker,
  node,
  seen = new Set(),
  found = new Set()
) {
  const candidate = unwrapContainerType(type, checker);
  if (seen.has(candidate)) return found;
  seen.add(candidate);
  if (candidate.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return found;

  for (const property of checker.getPropertiesOfType(candidate)) {
    const name = property.getName();
    const propertyType = checker.getTypeOfSymbolAtLocation(property, node);
    if (rawFieldNames.has(name)) found.add(name);
    rawFieldsInType(propertyType, checker, node, seen, found);
  }
  return found;
}

function variableInitializer(identifier, checker) {
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(identifier),
    checker
  );
  if (declaration && ts.isVariableDeclaration(declaration)) {
    return declaration.initializer ?? null;
  }
  if (declaration && ts.isBindingElement(declaration)) {
    const variable = declaration.parent?.parent;
    if (variable && ts.isVariableDeclaration(variable)) {
      return variable.initializer ?? null;
    }
  }
  return null;
}

function literalStringValue(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return null;
  seen.add(candidate);
  if (
    ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate)
  ) {
    return candidate.text;
  }
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    return initializer ? literalStringValue(initializer, checker, seen) : null;
  }
  return null;
}

function hasDatabaseQueryProvenance(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);

  if (ts.isAwaitExpression(candidate)) {
    return hasDatabaseQueryProvenance(candidate.expression, checker, seen);
  }
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    if (initializer) {
      return hasDatabaseQueryProvenance(initializer, checker, seen);
    }
    return isRecognizedDatabaseAccessorDeclaration(
      symbolDeclaration(checker.getSymbolAtLocation(candidate), checker),
      checker
    );
  }
  if (ts.isCallExpression(candidate)) {
    const callee = unwrap(candidate.expression);
    if (
      ts.isIdentifier(callee) &&
      isRecognizedDatabaseAccessorDeclaration(
        symbolDeclaration(checker.getSymbolAtLocation(callee), checker),
        checker
      )
    ) {
      return true;
    }
    if (ts.isIdentifier(callee)) {
      const initializer = variableInitializer(callee, checker);
      if (
        initializer &&
        hasDatabaseQueryProvenance(initializer, checker, seen)
      ) {
        return true;
      }
    }
    if (ts.isPropertyAccessExpression(callee)) {
      if (
        callee.name.text === "createConnection" &&
        isTrustedMysqlConnectionFactory(callee.expression, checker)
      ) {
        return true;
      }
      return hasDatabaseQueryProvenance(callee.expression, checker, seen);
    }
  }
  if (ts.isPropertyAccessExpression(candidate)) {
    return hasDatabaseQueryProvenance(candidate.expression, checker, seen);
  }
  if (ts.isElementAccessExpression(candidate)) {
    return hasDatabaseQueryProvenance(candidate.expression, checker, seen);
  }
  if (ts.isConditionalExpression(candidate)) {
    return (
      hasDatabaseQueryProvenance(candidate.whenTrue, checker, seen) ||
      hasDatabaseQueryProvenance(candidate.whenFalse, checker, seen)
    );
  }
  return false;
}

function isRecognizedDatabaseAccessorDeclaration(declaration, checker) {
  if (!declaration) return false;
  const name = ts.isImportSpecifier(declaration)
    ? (declaration.propertyName?.text ?? declaration.name.text)
    : declaration.name && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : "";
  const isNamedAccessor =
    name === "getDb" ||
    name === "getConn" ||
    /^get[A-Z].*(Db|Conn)$/.test(name);
  if (isNamedAccessor && isTrustedDynamicDatabaseBinding(declaration)) {
    return true;
  }
  const sourcePath = canonicalPath(declaration.getSourceFile().fileName);
  if (isNamedAccessor && /\/server\/db(?:\.ts|\/)/.test(sourcePath)) {
    return true;
  }
  if (
    (ts.isFunctionDeclaration(declaration) ||
      ts.isFunctionExpression(declaration) ||
      ts.isArrowFunction(declaration)) &&
    declaration.body
  ) {
    return returnExpressions(declaration).some(returned =>
      hasDatabaseQueryProvenance(returned, checker)
    );
  }
  return false;
}

function isTrustedDynamicDatabaseBinding(declaration) {
  if (!ts.isBindingElement(declaration)) return false;
  const variableDeclaration = declaration.parent?.parent;
  if (!variableDeclaration || !ts.isVariableDeclaration(variableDeclaration)) {
    return false;
  }
  const initialValue = unwrap(variableDeclaration.initializer);
  const initializer = ts.isAwaitExpression(initialValue)
    ? unwrap(initialValue.expression)
    : initialValue;
  if (!initializer || !ts.isCallExpression(initializer)) return false;
  const callee = unwrap(initializer.expression);
  if (callee.kind !== ts.SyntaxKind.ImportKeyword) return false;
  const specifier = initializer.arguments[0];
  return (
    !!specifier &&
    ts.isStringLiteral(specifier) &&
    /(?:^|\/)db(?:\.js)?$/.test(specifier.text)
  );
}

function isTrustedMysqlConnectionFactory(expression, checker) {
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(unwrap(expression)),
    checker
  );
  if (!declaration) return false;
  const sourcePath = canonicalPath(declaration.getSourceFile().fileName);
  return sourcePath.includes("/node_modules/") && sourcePath.includes("mysql2");
}

function isSharedDataAccessHelper(expression, checker) {
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expression) ? expression.name : expression
  );
  const declaration = symbolDeclaration(symbol, checker);
  if (!declaration) return false;
  const sourcePath = canonicalPath(declaration.getSourceFile().fileName);
  return /\/server\/db(?:\.ts|\/)/.test(sourcePath);
}

function localFunctionDeclaration(expression, checker) {
  const symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expression) ? expression.name : expression
  );
  const declaration = symbolDeclaration(symbol, checker);
  if (
    !declaration ||
    !(
      ts.isFunctionDeclaration(declaration) ||
      ts.isFunctionExpression(declaration) ||
      ts.isArrowFunction(declaration) ||
      ts.isMethodDeclaration(declaration)
    ) ||
    !declaration.body ||
    declaration.getSourceFile().isDeclarationFile
  ) {
    return null;
  }
  const sourcePath = canonicalPath(declaration.getSourceFile().fileName);
  return /\/(?:server|shared)\//.test(sourcePath) ? declaration : null;
}

function rawFieldsInFunctionReturns(declaration, checker, seen, found) {
  if (seen.has(declaration)) return found;
  seen.add(declaration);
  if (!ts.isBlock(declaration.body)) {
    return rawFieldsInExpression(declaration.body, checker, seen, found);
  }
  for (const returned of returnExpressions(declaration)) {
    rawFieldsInExpression(returned, checker, seen, found);
  }
  return found;
}

function plainAssignmentsForIdentifier(identifier, checker) {
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(identifier),
    checker
  );
  if (!declaration) return [];
  let scope = identifier.parent;
  while (
    scope &&
    !(
      ts.isFunctionDeclaration(scope) ||
      ts.isFunctionExpression(scope) ||
      ts.isArrowFunction(scope) ||
      ts.isMethodDeclaration(scope)
    )
  ) {
    scope = scope.parent;
  }
  if (!scope?.body) return [];
  const assignments = [];
  const visit = node => {
    if (
      node !== scope.body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      bindingDeclarations(node.left, checker).has(declaration)
    ) {
      assignments.push(node.right);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope.body);
  return assignments;
}

function rawFieldsInExpression(
  expression,
  checker,
  seen = new Set(),
  found = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return found;
  seen.add(candidate);

  if (hasDatabaseQueryProvenance(candidate, checker)) {
    for (const field of rawFieldsInType(
      checker.getTypeAtLocation(candidate),
      checker,
      candidate
    )) {
      found.add(field);
    }
  }

  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    if (initializer) {
      rawFieldsInExpression(initializer, checker, seen, found);
    } else {
      for (const assigned of plainAssignmentsForIdentifier(
        candidate,
        checker
      )) {
        rawFieldsInExpression(assigned, checker, seen, found);
      }
    }
    return found;
  }

  if (ts.isPropertyAccessExpression(candidate)) {
    if (rawFieldNames.has(candidate.name.text)) found.add(candidate.name.text);
    rawFieldsInExpression(candidate.expression, checker, seen, found);
    return found;
  }

  if (ts.isElementAccessExpression(candidate)) {
    rawFieldsInExpression(candidate.expression, checker, seen, found);
    if (candidate.argumentExpression) {
      const field = literalStringValue(candidate.argumentExpression, checker);
      if (field && rawFieldNames.has(field)) {
        found.add(field);
      } else {
        rawFieldsInExpression(
          candidate.argumentExpression,
          checker,
          seen,
          found
        );
      }
    }
    return found;
  }

  if (ts.isConditionalExpression(candidate)) {
    rawFieldsInExpression(candidate.whenTrue, checker, seen, found);
    rawFieldsInExpression(candidate.whenFalse, checker, seen, found);
    return found;
  }

  if (ts.isBinaryExpression(candidate)) {
    rawFieldsInExpression(candidate.left, checker, seen, found);
    rawFieldsInExpression(candidate.right, checker, seen, found);
    return found;
  }

  if (ts.isAwaitExpression(candidate)) {
    rawFieldsInExpression(candidate.expression, checker, seen, found);
    return found;
  }

  if (ts.isObjectLiteralExpression(candidate)) {
    for (const property of candidate.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property);
        if (name && rawFieldNames.has(name)) found.add(name);
        rawFieldsInExpression(property.initializer, checker, seen, found);
      } else if (ts.isSpreadAssignment(property)) {
        rawFieldsInExpression(property.expression, checker, seen, found);
      }
    }
    return found;
  }

  if (ts.isArrayLiteralExpression(candidate)) {
    for (const element of candidate.elements) {
      rawFieldsInExpression(element, checker, seen, found);
    }
    return found;
  }

  if (ts.isCallExpression(candidate)) {
    const callee = unwrap(candidate.expression);
    if (isSharedDataAccessHelper(callee, checker)) {
      for (const field of rawFieldsInType(
        checker.getTypeAtLocation(candidate),
        checker,
        candidate
      )) {
        found.add(field);
      }
    }
    const declaration = localFunctionDeclaration(callee, checker);
    if (declaration) {
      rawFieldsInFunctionReturns(declaration, checker, seen, found);
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "map" &&
      candidate.arguments.length > 0
    ) {
      rawFieldsInExpression(callee.expression, checker, seen, found);
      const callback = candidate.arguments[0];
      if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
        if (ts.isBlock(callback.body)) {
          for (const statement of callback.body.statements) {
            if (ts.isReturnStatement(statement) && statement.expression) {
              rawFieldsInExpression(statement.expression, checker, seen, found);
            }
          }
        } else {
          rawFieldsInExpression(callback.body, checker, seen, found);
        }
      }
    } else {
      // An arbitrary transformation (for example Object.assign, JSON round
      // trip, or an unreviewed local utility) cannot make a raw returned
      // argument safe. Traverse all arguments so it remains an inventory
      // candidate until a later reviewed remediation proves a safe projection.
      for (const argument of candidate.arguments) {
        rawFieldsInExpression(argument, checker, seen, found);
      }
    }
    return found;
  }

  return found;
}

function returnExpressions(callback) {
  if (!ts.isBlock(callback.body)) return [callback.body];
  const expressions = [];
  const visit = node => {
    if (
      node !== callback.body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return expressions;
}

function rawSqlText(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return "";
  seen.add(candidate);
  if (ts.isTaggedTemplateExpression(candidate)) {
    return candidate.template.getText(candidate.getSourceFile()).toLowerCase();
  }
  if (
    ts.isNoSubstitutionTemplateLiteral(candidate) ||
    ts.isStringLiteral(candidate)
  ) {
    return candidate.text.toLowerCase();
  }
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    return initializer ? rawSqlText(initializer, checker, seen) : "";
  }
  if (ts.isBinaryExpression(candidate)) {
    return [
      rawSqlText(candidate.left, checker, seen),
      rawSqlText(candidate.right, checker, seen),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (ts.isConditionalExpression(candidate)) {
    return [
      rawSqlText(candidate.whenTrue, checker, seen),
      rawSqlText(candidate.whenFalse, checker, seen),
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (ts.isArrayLiteralExpression(candidate)) {
    return candidate.elements
      .map(element => rawSqlText(element, checker, seen))
      .filter(Boolean)
      .join(" ");
  }
  if (ts.isCallExpression(candidate)) {
    const callee = unwrap(candidate.expression);
    if (isTrustedDrizzleSqlRawBuilder(callee, checker)) {
      return candidate.arguments
        .map(argument => rawSqlText(argument, checker, seen))
        .join(" ");
    }
  }
  return "";
}

function staticMemberAccess(expression, checker) {
  const candidate = unwrap(expression);
  if (ts.isPropertyAccessExpression(candidate)) {
    return { receiver: candidate.expression, name: candidate.name.text };
  }
  if (ts.isElementAccessExpression(candidate) && candidate.argumentExpression) {
    const name = literalStringValue(candidate.argumentExpression, checker);
    return name ? { receiver: candidate.expression, name } : null;
  }
  return null;
}

function isTrustedDrizzleSqlRawBuilder(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    return initializer
      ? isTrustedDrizzleSqlRawBuilder(initializer, checker, seen)
      : false;
  }
  const member = staticMemberAccess(candidate, checker);
  if (!member || member.name !== "raw") {
    return false;
  }
  return isTrustedDrizzleSqlBuilderValue(member.receiver, checker);
}

function isTrustedDrizzleSqlBuilderValue(
  expression,
  checker,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);
  const declaration = symbolDeclaration(
    checker.getSymbolAtLocation(candidate),
    checker
  );
  const sourcePath = declaration
    ? canonicalPath(declaration.getSourceFile().fileName)
    : "";
  if (
    /\/node_modules\/(?:\.pnpm\/)?drizzle-orm(?:@[^/]+)?\//.test(sourcePath)
  ) {
    return true;
  }
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    return initializer
      ? isTrustedDrizzleSqlBuilderValue(initializer, checker, seen)
      : false;
  }
  return false;
}

function sqlExecutionCallable(expression, checker, seen = new Set()) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return null;
  seen.add(candidate);

  const member = staticMemberAccess(candidate, checker);
  if (member) {
    if (["call", "apply"].includes(member.name)) {
      return sqlExecutionCallable(member.receiver, checker, seen);
    }
    return ["execute", "query"].includes(member.name) &&
      hasDatabaseQueryProvenance(member.receiver, checker)
      ? { receiver: member.receiver, method: member.name }
      : null;
  }
  if (ts.isIdentifier(candidate)) {
    const initializer = variableInitializer(candidate, checker);
    return initializer
      ? sqlExecutionCallable(initializer, checker, seen)
      : null;
  }
  if (ts.isCallExpression(candidate)) {
    const callee = unwrap(candidate.expression);
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "bind" &&
      candidate.arguments.length > 0
    ) {
      return sqlExecutionCallable(callee.expression, checker, seen);
    }
  }
  return null;
}

function sqlExecutionCall(expression, checker) {
  const candidate = unwrap(expression);
  if (!ts.isCallExpression(candidate)) return null;
  return sqlExecutionCallable(candidate.expression, checker) ? candidate : null;
}

function expressionContainsRawSqlExecution(
  expression,
  checker,
  visitedFunctions = new Set()
) {
  let found = false;
  const visit = node => {
    if (found) return;
    if (
      node !== expression &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node))
    ) {
      return;
    }
    const execution = sqlExecutionCall(node, checker);
    if (execution) {
      const text = execution.arguments
        .map(argument => rawSqlText(argument, checker))
        .join(" ");
      if (rawSqlFieldNames.some(field => text.includes(field))) {
        found = true;
        return;
      }
    }
    if (ts.isCallExpression(node)) {
      const declaration = localFunctionDeclaration(
        unwrap(node.expression),
        checker
      );
      if (declaration && !visitedFunctions.has(declaration)) {
        visitedFunctions.add(declaration);
        if (
          expressionContainsRawSqlExecution(
            declaration.body,
            checker,
            visitedFunctions
          )
        ) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function bindingDeclarations(binding, checker, found = new Set()) {
  if (ts.isIdentifier(binding)) {
    const declaration = symbolDeclaration(
      checker.getSymbolAtLocation(binding),
      checker
    );
    if (declaration) found.add(declaration);
  } else if (
    ts.isObjectBindingPattern(binding) ||
    ts.isArrayBindingPattern(binding)
  ) {
    for (const element of binding.elements) {
      if (ts.isBindingElement(element)) {
        bindingDeclarations(element.name, checker, found);
      }
    }
  }
  return found;
}

function rawSqlResultDeclarations(callback, checker) {
  const declarations = new Set();
  const visit = node => {
    if (
      node !== callback.body &&
      (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node))
    ) {
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      expressionContainsRawSqlExecution(node.initializer, checker)
    ) {
      bindingDeclarations(node.name, checker, declarations);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      expressionContainsRawSqlExecution(node.right, checker)
    ) {
      bindingDeclarations(node.left, checker, declarations);
    }
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return declarations;
}

function expressionReferencesRawSqlResult(
  expression,
  checker,
  rawSqlDeclarations,
  seen = new Set()
) {
  const candidate = unwrap(expression);
  if (seen.has(candidate)) return false;
  seen.add(candidate);
  if (expressionContainsRawSqlExecution(candidate, checker)) return true;

  if (ts.isIdentifier(candidate)) {
    const declaration = symbolDeclaration(
      checker.getSymbolAtLocation(candidate),
      checker
    );
    if (declaration && rawSqlDeclarations.has(declaration)) return true;
    const initializer = variableInitializer(candidate, checker);
    return initializer
      ? expressionReferencesRawSqlResult(
          initializer,
          checker,
          rawSqlDeclarations,
          seen
        )
      : false;
  }
  if (ts.isPropertyAccessExpression(candidate)) {
    return expressionReferencesRawSqlResult(
      candidate.expression,
      checker,
      rawSqlDeclarations,
      seen
    );
  }
  if (ts.isElementAccessExpression(candidate)) {
    return expressionReferencesRawSqlResult(
      candidate.expression,
      checker,
      rawSqlDeclarations,
      seen
    );
  }
  if (ts.isAwaitExpression(candidate)) {
    return expressionReferencesRawSqlResult(
      candidate.expression,
      checker,
      rawSqlDeclarations,
      seen
    );
  }
  if (ts.isConditionalExpression(candidate)) {
    return (
      expressionReferencesRawSqlResult(
        candidate.whenTrue,
        checker,
        rawSqlDeclarations,
        seen
      ) ||
      expressionReferencesRawSqlResult(
        candidate.whenFalse,
        checker,
        rawSqlDeclarations,
        seen
      )
    );
  }
  if (ts.isBinaryExpression(candidate)) {
    return (
      expressionReferencesRawSqlResult(
        candidate.left,
        checker,
        rawSqlDeclarations,
        seen
      ) ||
      expressionReferencesRawSqlResult(
        candidate.right,
        checker,
        rawSqlDeclarations,
        seen
      )
    );
  }
  if (ts.isObjectLiteralExpression(candidate)) {
    return candidate.properties.some(property =>
      ts.isPropertyAssignment(property)
        ? expressionReferencesRawSqlResult(
            property.initializer,
            checker,
            rawSqlDeclarations,
            seen
          )
        : ts.isSpreadAssignment(property)
          ? expressionReferencesRawSqlResult(
              property.expression,
              checker,
              rawSqlDeclarations,
              seen
            )
          : false
    );
  }
  if (ts.isArrayLiteralExpression(candidate)) {
    return candidate.elements.some(element =>
      expressionReferencesRawSqlResult(
        element,
        checker,
        rawSqlDeclarations,
        seen
      )
    );
  }
  if (ts.isCallExpression(candidate)) {
    return (
      expressionReferencesRawSqlResult(
        candidate.expression,
        checker,
        rawSqlDeclarations,
        seen
      ) ||
      candidate.arguments.some(argument =>
        expressionReferencesRawSqlResult(
          argument,
          checker,
          rawSqlDeclarations,
          seen
        )
      )
    );
  }
  return false;
}

function sourceLocation(node, root) {
  const sourceFile = node.getSourceFile();
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile)
  );
  return {
    path: canonicalPath(relative(root, sourceFile.fileName)),
    line: position.line + 1,
    column: position.character + 1,
  };
}

function assertExportedAppRouter(program, root) {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(resolve(root, routersRelativePath));
  if (!sourceFile)
    throw new Error(`${routersRelativePath}: source is missing from tsconfig.`);
  const binding = directVariableDeclaration(sourceFile, "appRouter");
  if (!binding?.exported || !binding.declaration.initializer) {
    throw new Error(
      `${routersRelativePath}: appRouter must be an exported direct variable declaration.`
    );
  }
  const router = resolveRouterObjectLiteral(
    binding.declaration.initializer,
    checker,
    root
  );
  if (!router)
    throw new Error(`${routersRelativePath}: appRouter cannot be resolved.`);
  return { checker, appRouter: router };
}

function procedureEntries(program, root) {
  const { checker, appRouter } = assertExportedAppRouter(program, root);
  const entries = [];
  for (const namespaceProperty of appRouter.properties) {
    const namespace = routerPropertyName(namespaceProperty);
    if (!namespace) {
      throw new Error(
        `${sourceLocation(namespaceProperty, root).path}: appRouter uses an unresolved namespace property.`
      );
    }
    const router = routerObjectForProperty(namespaceProperty, checker, root);
    if (!router) {
      throw new Error(
        `${sourceLocation(namespaceProperty, root).path}: appRouter.${namespace} cannot be resolved.`
      );
    }
    for (const property of router.properties) {
      const procedure = routerPropertyName(property);
      const value = procedureValueExpression(property, checker);
      if (!procedure || !value) {
        throw new Error(
          `${sourceLocation(property, root).path}: appRouter.${namespace} contains an unresolved procedure property.`
        );
      }
      const callback = procedureCallback(value, checker, root);
      if (!callback) {
        throw new Error(
          `${sourceLocation(property, root).path}: appRouter.${namespace}.${procedure} cannot be resolved to a trusted inline tRPC procedure callback.`
        );
      }
      entries.push({
        key: `${namespace}.${procedure}`,
        callback,
        procedure: value,
        location: sourceLocation(property, root),
      });
    }
  }
  return { checker, entries };
}

export function scanRawFraudProcedureEmissions(program, root = repositoryRoot) {
  const { checker, entries } = procedureEntries(program, root);
  const emissions = [];

  for (const entry of entries) {
    const fields = new Set();
    const returnedExpressions = returnExpressions(entry.callback);
    for (const returned of returnedExpressions) {
      // A verified canonical helper excludes only this returned outcome. Other
      // branches in the same procedure are still inspected for raw emission.
      if (expressionProducesCanonicalHold(returned, checker, root)) continue;
      for (const field of rawFieldsInExpression(returned, checker)) {
        fields.add(field);
      }
    }

    // A SQL execution that selects a raw fraud column but returns only an
    // opaque derived value must remain in the quarantine until a remediation
    // proves its public projection safe. Ordinary strings, inputs, comments,
    // and explicit null redactions are not SQL evidence.
    const rawSqlDeclarations = rawSqlResultDeclarations(
      entry.callback,
      checker
    );
    if (
      fields.size === 0 &&
      returnedExpressions.length > 0 &&
      (rawSqlDeclarations.size > 0 ||
        returnedExpressions.some(returned =>
          expressionReferencesRawSqlResult(
            returned,
            checker,
            rawSqlDeclarations
          )
        ))
    ) {
      fields.add("UNRESOLVED_RAW_FRAUD_SQL_OUTPUT");
    }
    if (fields.size === 0) continue;

    const entryWithoutFingerprint = {
      key: entry.key,
      path: entry.location.path,
      line: entry.location.line,
      column: entry.location.column,
      fields: [...fields].sort(),
    };
    emissions.push({
      ...entryWithoutFingerprint,
      fingerprint: fingerprintRawFraudEmission(entryWithoutFingerprint),
    });
  }

  return emissions.sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint)
  );
}

export function createProgramForRepository(root = repositoryRoot) {
  const configPath = ts.findConfigFile(
    root,
    ts.sys.fileExists,
    "tsconfig.json"
  );
  if (!configPath) throw new Error(`${root}: tsconfig.json is missing.`);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, " ")
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath)
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map(error => ts.flattenDiagnosticMessageText(error.messageText, " "))
        .join("; ")
    );
  }
  return ts.createProgram(parsed.fileNames, parsed.options);
}

export function fingerprintRawFraudEmission(entry) {
  return createHash("sha256")
    .update(
      [
        entry.key,
        entry.path,
        String(entry.line),
        String(entry.column),
        ...entry.fields,
      ].join("\u0000")
    )
    .digest("hex");
}

function canonicalManifestEntry(entry) {
  return {
    key: entry.key,
    path: entry.path,
    line: entry.line,
    column: entry.column,
    fields: [...entry.fields].sort(),
    fingerprint: entry.fingerprint,
  };
}

const manifestFields = new Set([
  "key",
  "path",
  "line",
  "column",
  "fields",
  "fingerprint",
]);

function exactManifestMap(entries, label) {
  if (!Array.isArray(entries))
    throw new Error(`P0-B1 ${label} raw-emission inventory must be an array.`);
  const result = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `P0-B1 ${label} raw-emission inventory contains a non-object entry.`
      );
    }
    const keys = Object.keys(entry).sort();
    if (
      keys.length !== manifestFields.size ||
      keys.some(key => !manifestFields.has(key))
    ) {
      throw new Error(
        `P0-B1 ${label} raw-emission inventory entry must contain exactly the approved fingerprint fields.`
      );
    }
    if (
      typeof entry.key !== "string" ||
      !entry.key ||
      typeof entry.path !== "string" ||
      !entry.path ||
      !Number.isSafeInteger(entry.line) ||
      entry.line < 1 ||
      !Number.isSafeInteger(entry.column) ||
      entry.column < 1 ||
      !Array.isArray(entry.fields) ||
      entry.fields.length === 0 ||
      entry.fields.some(field => typeof field !== "string" || !field) ||
      typeof entry.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.fingerprint)
    ) {
      throw new Error(
        `P0-B1 ${label} raw-emission inventory entry has an invalid exact fingerprint shape.`
      );
    }
    const canonical = canonicalManifestEntry(entry);
    if (canonical.fingerprint !== fingerprintRawFraudEmission(canonical)) {
      throw new Error(
        `P0-B1 ${label} raw-emission inventory fingerprint does not match its route, source location, and fields.`
      );
    }
    if (result.has(canonical.fingerprint)) {
      throw new Error(
        `P0-B1 ${label} raw-emission inventory contains a duplicate exact fingerprint.`
      );
    }
    result.set(canonical.fingerprint, canonical);
  }
  return result;
}

export function compareExactRawFraudEmissionManifest(actual, expected) {
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
    "P0-B1 raw-fraud tRPC emission inventory drift detected.",
    "This inventory is an unremediated quarantine, not an allow-list: every change requires an independently reviewed remediation or inventory decision.",
  ];
  for (const entry of missing) {
    lines.push(
      `- missing or moved candidate: ${entry.key} at ${entry.path}:${entry.line}:${entry.column} [${entry.fields.join(", ")}]`
    );
  }
  for (const entry of unexpected) {
    lines.push(
      `- unreviewed raw-fraud candidate: ${entry.key} at ${entry.path}:${entry.line}:${entry.column} [${entry.fields.join(", ")}]`
    );
  }
  throw new Error(lines.join("\n"));
}

export async function verifyRawFraudEmissionManifest(
  root = repositoryRoot,
  manifest = null
) {
  const expected =
    manifest ??
    JSON.parse(await readFile(resolve(root, manifestRelativePath), "utf8"));
  const actual = scanRawFraudProcedureEmissions(
    createProgramForRepository(root),
    root
  );
  compareExactRawFraudEmissionManifest(actual, expected);
  return actual;
}

export function assertNoRawFraudProcedureEmissions(entries) {
  if (entries.length === 0) return;
  throw new Error(
    [
      "P0-B1 raw fraud data remains reachable through exported tRPC procedure output.",
      ...entries.map(
        entry =>
          `- ${entry.key} at ${entry.path}:${entry.line}:${entry.column} [${entry.fields.join(", ")}]`
      ),
    ].join("\n")
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const entries = await verifyRawFraudEmissionManifest();
  console.log(
    `P0-B1 raw-fraud emission inventory verified for ${entries.length} exact unremediated procedure fingerprints.`
  );
}
