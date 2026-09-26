import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

/**
 * B-G0 registers the live query boundaries already found to turn a canonical
 * P0-B1 fraud hold into zero/default/green browser output. Verification is
 * intentionally lexical: it resolves only a named exported component's direct
 * function scope and only the getRiskPortfolioAnalytics property inside the
 * exported claimsRouter object. Same-named decoys elsewhere must fail closed.
 */
export const P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS = Object.freeze([
  Object.freeze({
    path: "client/src/components/VehiclePassportPanel.tsx",
    componentName: "VehiclePassportPanel",
    queryCallee: "trpc.vehiclePassport.getFraudSignals.useQuery",
    queryResultVariable: "fraudData",
    responseSourceExpression: "fraudData",
    responseVariable: "fraudDecisionResponse",
    holdVariable: "fraudDecisionHold",
    renderHoldVariable: "fraudPresentationHold",
    valueVariable: "fraudSignals",
  }),
  Object.freeze({
    path: "client/src/components/executive/ExecutiveAlertsCenter.tsx",
    componentName: "ExecutiveAlertsCenter",
    queryCallee: "trpc.analytics.getExecutiveAlerts.useQuery",
    queryResultVariable: "data",
    responseSourceExpression: "data",
    responseVariable: "executiveAlertsResponse",
    holdVariable: "fraudDecisionHold",
    valueVariable: "availableExecutiveAlerts",
  }),
  Object.freeze({
    path: "client/src/pages/ExternalAssessorDashboard.tsx",
    componentName: "ExpandableClaimRow",
    queryCallee: "trpc.aiAssessments.byClaim.useQuery",
    queryResultVariable: "aiData",
    responseSourceExpression: "aiData",
    responseVariable: "fraudDecisionResponse",
    holdVariable: "fraudDecisionHold",
    valueVariable: "availableAiData",
  }),
  Object.freeze({
    path: "client/src/pages/RiskManagerDashboard.tsx",
    componentName: "RiskManagerDashboard",
    queryCallee: "trpc.claims.getRiskPortfolioAnalytics.useQuery",
    queryResultVariable: "riskPortfolioQuery",
    responseSourceExpression: "riskPortfolioQuery.data",
    responseVariable: "riskPortfolioResponse",
    holdVariable: "riskPortfolioHold",
    valueVariable: "riskAnalytics",
  }),
]);

const riskRoutePath = "server/routers/claims-core.ts";

function parseSource(path, source) {
  const scriptKind = path.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  if (parsed.parseDiagnostics.length > 0) {
    const details = parsed.parseDiagnostics
      .map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")
      )
      .join("; ");
    throw new Error(`${path}: TypeScript parsing failed: ${details}`);
  }
  return parsed;
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text;
  }
  return null;
}

function hasExportModifier(node) {
  return Boolean(
    node.modifiers?.some(
      modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
    )
  );
}

function findExportedFunction(sourceFile, name) {
  const matches = sourceFile.statements.filter(
    statement =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      hasExportModifier(statement) &&
      statement.body
  );
  return matches.length === 1 ? matches[0] : null;
}

function directVariableDeclarations(component) {
  const declarations = new Map();
  for (const statement of component.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        declarations.set(declaration.name.text, declaration);
      }
    }
  }
  return declarations;
}

function isNamedCall(expression, expectedCallee) {
  const candidate = unwrap(expression);
  return (
    ts.isCallExpression(candidate) &&
    candidate.expression.getText() === expectedCallee
  );
}

function hasDirectQueryBinding(component, target) {
  for (const statement of component.body.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !declaration.initializer ||
        !isNamedCall(declaration.initializer, target.queryCallee)
      ) {
        continue;
      }

      if (ts.isIdentifier(declaration.name)) {
        if (declaration.name.text === target.queryResultVariable) return true;
        continue;
      }

      if (!ts.isObjectBindingPattern(declaration.name)) continue;
      const matchesResult = declaration.name.elements.some(element => {
        const boundName = ts.isIdentifier(element.name)
          ? element.name.text
          : null;
        const sourceName = element.propertyName
          ? element.propertyName.getText()
          : boundName;
        return (
          boundName === target.queryResultVariable && sourceName === "data"
        );
      });
      if (matchesResult) return true;
    }
  }
  return false;
}

function propertyAccessMatches(expression, objectPath, property) {
  const candidate = unwrap(expression);
  return (
    ts.isPropertyAccessExpression(candidate) &&
    candidate.name.text === property &&
    candidate.expression.getText() === objectPath
  );
}

function expressionContainsPropertyAccess(expression, objectPath, property) {
  let found = false;
  const visit = node => {
    if (propertyAccessMatches(node, objectPath, property)) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function propertyAccessHasRoot(expression, root) {
  const candidate = unwrap(expression);
  if (candidate.getText() === root) return true;
  return (
    ts.isPropertyAccessExpression(candidate) &&
    propertyAccessHasRoot(candidate.expression, root)
  );
}

function expressionContainsPropertyChain(expression, root, property) {
  let found = false;
  const visit = node => {
    const candidate = unwrap(node);
    if (
      ts.isPropertyAccessExpression(candidate) &&
      candidate.name.text === property &&
      propertyAccessHasRoot(candidate.expression, root)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function isDiscriminatorCall(expression, sourceExpression) {
  const candidate = unwrap(expression);
  return (
    ts.isCallExpression(candidate) &&
    ts.isIdentifier(candidate.expression) &&
    candidate.expression.text === "discriminateP0B1FraudDecisionResponse" &&
    candidate.arguments.length === 1 &&
    candidate.arguments[0].getText() === sourceExpression
  );
}

function isDirectHoldRenderer(node, holdVariable) {
  const candidate = unwrap(node);
  const openingElement = ts.isJsxSelfClosingElement(candidate)
    ? candidate
    : ts.isJsxElement(candidate)
      ? candidate.openingElement
      : null;
  if (
    !openingElement ||
    openingElement.tagName.getText() !== "P0FraudValidationHold"
  ) {
    return false;
  }

  const holdAttribute = openingElement.attributes.properties.find(
    property => ts.isJsxAttribute(property) && property.name.text === "hold"
  );
  return Boolean(
    holdAttribute &&
      ts.isJsxAttribute(holdAttribute) &&
      holdAttribute.initializer &&
      ts.isJsxExpression(holdAttribute.initializer) &&
      holdAttribute.initializer.expression &&
      ts.isIdentifier(unwrap(holdAttribute.initializer.expression)) &&
      unwrap(holdAttribute.initializer.expression).text === holdVariable
  );
}

function directComponentRender(component) {
  const returns = component.body.statements.filter(ts.isReturnStatement);
  return returns.length === 1 && returns[0].expression
    ? returns[0].expression
    : null;
}

function renderHasHoldBranch(render, holdVariable) {
  let found = false;
  const visit = node => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return;
    }
    if (
      ts.isConditionalExpression(node) &&
      ts.isIdentifier(unwrap(node.condition)) &&
      unwrap(node.condition).text === holdVariable &&
      isDirectHoldRenderer(node.whenTrue, holdVariable)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(render);
  return found;
}

function stringLiteralValue(node) {
  const candidate = unwrap(node);
  return ts.isStringLiteral(candidate) ||
    ts.isNoSubstitutionTemplateLiteral(candidate)
    ? candidate.text
    : null;
}

function isReassuranceLiteral(node) {
  const literal = stringLiteralValue(node);
  return literal === "All clear" || literal === "No active alerts";
}

function directTreeContainsReassurance(node) {
  let found = false;
  const visit = candidate => {
    if (found) return;
    if (ts.isArrowFunction(candidate) || ts.isFunctionExpression(candidate)) {
      return;
    }
    if (isReassuranceLiteral(candidate)) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function hasUngatedReassurance(render, holdVariable) {
  let unsafe = false;
  const visit = (node, holdDominates) => {
    if (unsafe) return;
    if (
      ts.isConditionalExpression(node) &&
      ts.isIdentifier(unwrap(node.condition)) &&
      unwrap(node.condition).text === holdVariable
    ) {
      if (directTreeContainsReassurance(node.whenTrue)) {
        unsafe = true;
        return;
      }
      visit(node.whenTrue, true);
      visit(node.whenFalse, true);
      return;
    }

    if (!holdDominates && isReassuranceLiteral(node)) {
      unsafe = true;
      return;
    }
    ts.forEachChild(node, child => visit(child, holdDominates));
  };
  visit(render, false);
  return unsafe;
}

function containsNullishNumericDefault(
  render,
  objectName,
  propertyName,
  numericText
) {
  let found = false;
  const visit = node => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isNumericLiteral(unwrap(node.right)) &&
      unwrap(node.right).text === numericText &&
      expressionContainsPropertyChain(node.left, objectName, propertyName)
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(render);
  return found;
}

function verifyClientBoundary(target, source, failures) {
  const sourceFile = parseSource(target.path, source);
  const component = findExportedFunction(sourceFile, target.componentName);
  if (!component) {
    failures.push(
      `${target.path}: exported ${target.componentName} function is missing or ambiguous.`
    );
    return;
  }

  if (!hasDirectQueryBinding(component, target)) {
    failures.push(
      `${target.path}: ${target.queryResultVariable} is not directly bound to ${target.queryCallee} in the exported ${target.componentName} scope.`
    );
  }

  const variables = directVariableDeclarations(component);
  const response = variables.get(target.responseVariable)?.initializer;
  const hold = variables.get(target.holdVariable)?.initializer;
  const value = variables.get(target.valueVariable)?.initializer;

  if (
    !response ||
    !isDiscriminatorCall(response, target.responseSourceExpression)
  ) {
    failures.push(
      `${target.path}: ${target.responseVariable} is not directly bound to discriminateP0B1FraudDecisionResponse(${target.responseSourceExpression}) in the exported ${target.componentName} scope.`
    );
  }

  if (!hold || !propertyAccessMatches(hold, target.responseVariable, "hold")) {
    failures.push(
      `${target.path}: ${target.holdVariable} is not directly bound to ${target.responseVariable}.hold in the exported ${target.componentName} scope.`
    );
  }

  if (
    !value ||
    !propertyAccessMatches(value, target.responseVariable, "value")
  ) {
    failures.push(
      `${target.path}: ${target.valueVariable} is not directly bound to ${target.responseVariable}.value in the exported ${target.componentName} scope.`
    );
  }

  const renderHoldVariable = target.renderHoldVariable ?? target.holdVariable;
  if (target.renderHoldVariable) {
    const presentationHold = variables.get(
      target.renderHoldVariable
    )?.initializer;
    const directPresentationFallback =
      presentationHold &&
      ts.isBinaryExpression(unwrap(presentationHold)) &&
      unwrap(presentationHold).operatorToken.kind ===
        ts.SyntaxKind.QuestionQuestionToken &&
      ts.isIdentifier(unwrap(presentationHold).left) &&
      unwrap(presentationHold).left.text === target.holdVariable;
    if (!directPresentationFallback) {
      failures.push(
        `${target.path}: ${target.renderHoldVariable} must be a direct nullish fallback from ${target.holdVariable}.`
      );
    }
  }

  const render = directComponentRender(component);
  if (!render) {
    failures.push(
      `${target.path}: exported ${target.componentName} must retain exactly one direct render return.`
    );
  } else if (!renderHasHoldBranch(render, renderHoldVariable)) {
    failures.push(
      `${target.path}: ${renderHoldVariable} does not control a P0FraudValidationHold branch in the exported ${target.componentName} render.`
    );
  }

  if (target.componentName === "ExecutiveAlertsCenter") {
    if (render && hasUngatedReassurance(render, target.holdVariable)) {
      failures.push(
        `${target.path}: Executive reassurance output is not dominated by the direct fraud hold branch.`
      );
    }

    const alerts = variables.get("alerts")?.initializer;
    const directHoldEmptyList =
      alerts &&
      ts.isConditionalExpression(unwrap(alerts)) &&
      ts.isIdentifier(unwrap(alerts).condition) &&
      unwrap(alerts).condition.text === "fraudDecisionHold" &&
      ts.isArrayLiteralExpression(unwrap(alerts).whenTrue) &&
      unwrap(alerts).whenTrue.elements.length === 0 &&
      expressionContainsPropertyAccess(
        unwrap(alerts).whenFalse,
        "availableExecutiveAlerts",
        "alerts"
      );
    if (!directHoldEmptyList) {
      failures.push(
        `${target.path}: alerts must derive from availableExecutiveAlerts only in the direct non-held branch.`
      );
    }
  }

  if (target.componentName === "RiskManagerDashboard" && render) {
    const prohibitedZeroDefault = ["fraudRate", "avgFraudScore"].some(field =>
      containsNullishNumericDefault(render, "riskAnalytics", field, "0")
    );
    if (prohibitedZeroDefault) {
      failures.push(
        `${target.path}: Risk Portfolio KPI retains a raw numeric zero fallback.`
      );
    }
  }
}

function findExportedClaimsRouterObject(sourceFile) {
  const matches = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !hasExportModifier(statement))
      continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === "claimsRouter" &&
        declaration.initializer &&
        ts.isCallExpression(unwrap(declaration.initializer))
      ) {
        const objectArgument = unwrap(declaration.initializer).arguments.find(
          ts.isObjectLiteralExpression
        );
        if (objectArgument) matches.push(objectArgument);
      }
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

function findRiskPortfolioQueryCallback(sourceFile) {
  const routerObject = findExportedClaimsRouterObject(sourceFile);
  if (!routerObject) return null;

  const routes = routerObject.properties.filter(
    property =>
      ts.isPropertyAssignment(property) &&
      propertyName(property) === "getRiskPortfolioAnalytics"
  );
  if (routes.length !== 1) return null;

  const queryCall = unwrap(routes[0].initializer);
  if (
    !ts.isCallExpression(queryCall) ||
    !ts.isPropertyAccessExpression(queryCall.expression) ||
    queryCall.expression.name.text !== "query" ||
    queryCall.arguments.length !== 1 ||
    (!ts.isArrowFunction(queryCall.arguments[0]) &&
      !ts.isFunctionExpression(queryCall.arguments[0]))
  ) {
    return null;
  }

  const inputCall = unwrap(queryCall.expression.expression);
  if (
    !ts.isCallExpression(inputCall) ||
    !ts.isPropertyAccessExpression(inputCall.expression) ||
    inputCall.expression.name.text !== "input" ||
    inputCall.expression.expression.getText() !== "insurerDomainProcedure"
  ) {
    return null;
  }

  return queryCall.arguments[0];
}

function isCanonicalHoldReturn(statement) {
  const expression = statement.expression && unwrap(statement.expression);
  return (
    ts.isReturnStatement(statement) &&
    expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "buildP0B1FraudOutputHold" &&
    expression.arguments.length === 0
  );
}

function containsForbiddenRouteIdentifier(callback, identifiers) {
  const found = new Set();
  const visit = node => {
    if (ts.isIdentifier(node) && identifiers.has(node.text))
      found.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return [...found];
}

function verifyRiskPortfolioRoute(source, failures) {
  const sourceFile = parseSource(riskRoutePath, source);
  const callback = findRiskPortfolioQueryCallback(sourceFile);
  if (!callback || !ts.isBlock(callback.body)) {
    failures.push(
      `${riskRoutePath}: getRiskPortfolioAnalytics callback is missing or structurally unresolvable inside exported claimsRouter.`
    );
    return;
  }

  const directReturns = callback.body.statements.filter(ts.isReturnStatement);
  if (directReturns.length !== 1 || !isCanonicalHoldReturn(directReturns[0])) {
    failures.push(
      `${riskRoutePath}: exported claimsRouter.getRiskPortfolioAnalytics must retain exactly one direct canonical P0-B1 hold return.`
    );
  }

  const forbidden = containsForbiddenRouteIdentifier(
    callback,
    new Set(["getDb", "fraudRiskScore", "fraudRiskLevel"])
  );
  for (const identifier of forbidden) {
    failures.push(
      `${riskRoutePath}: Risk Portfolio hold route retains raw authority access: ${identifier}.`
    );
  }
}

export function verifyP0B1ClientHoldBoundary(sources) {
  const failures = [];

  for (const target of P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS) {
    const source = sources[target.path];
    if (typeof source !== "string") {
      failures.push(
        `${target.path}: source is missing from the boundary registry input.`
      );
      continue;
    }
    verifyClientBoundary(target, source, failures);
  }

  const riskRoute = sources[riskRoutePath];
  if (typeof riskRoute !== "string") {
    failures.push(
      `${riskRoutePath}: source is missing from the boundary registry input.`
    );
  } else {
    verifyRiskPortfolioRoute(riskRoute, failures);
  }

  if (failures.length > 0) {
    throw new Error(
      `P0-B1 client hold-boundary regression:\n${failures.map(failure => `- ${failure}`).join("\n")}`
    );
  }
}

export async function readP0B1ClientHoldBoundarySources(root = repositoryRoot) {
  const paths = [
    ...P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS.map(target => target.path),
    riskRoutePath,
  ];
  return Object.fromEntries(
    await Promise.all(
      paths.map(async path => [
        path,
        await readFile(resolve(root, path), "utf8"),
      ])
    )
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  verifyP0B1ClientHoldBoundary(await readP0B1ClientHoldBoundarySources());
  console.log(
    `P0-B1 client hold boundary verified for ${P0_B1_CLIENT_HOLD_BOUNDARY_TARGETS.length} browser boundaries and one exported server route.`
  );
}
