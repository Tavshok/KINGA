import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { P0_B1_FRAUD_DECISION_HOLD } from "./evidence-governance/p0FraudDecisionHold";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  audit: vi.fn(),
  validate: vi.fn(),
  insert: vi.fn(),
  db: null as any,
}));

vi.mock("./db", () => ({
  getDb: mocks.getDb,
}));
vi.mock("./security/p0TenantBoundary", async () => {
  const actual = await vi.importActual<
    typeof import("./security/p0TenantBoundary")
  >("./security/p0TenantBoundary");
  return {
    ...actual,
    auditP0CrossTenantAccess: mocks.audit,
    validateP0TenantScope: mocks.validate,
  };
});

import { executiveRouter } from "./routers/executive";

const tenantA = "tenant-a";
const tenantB = "tenant-b";
const executiveA = {
  user: {
    id: 101,
    role: "insurer",
    insurerRole: "executive",
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const superAdmin = {
  user: {
    id: 1,
    role: "platform_super_admin",
    insurerRole: null,
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const processorA = {
  user: {
    id: 102,
    role: "insurer",
    insurerRole: "claims_processor",
    tenantId: tenantA,
  },
  insurerTenantId: tenantA,
  req: { headers: {} },
} as any;
const executiveWithoutTenant = {
  user: { id: 103, role: "insurer", insurerRole: "executive", tenantId: null },
  insurerTenantId: null,
  req: { headers: {} },
} as any;
const superAdminWithoutTenant = {
  user: {
    id: 2,
    role: "platform_super_admin",
    insurerRole: null,
    tenantId: null,
  },
  insurerTenantId: null,
  req: { headers: {} },
} as any;

describe("P0 Package 3 runtime — Executive operational detail", () => {
  beforeEach(() => {
    mocks.getDb.mockReset();
    mocks.execute.mockReset();
    mocks.select.mockReset();
    mocks.audit.mockReset();
    mocks.validate.mockReset();
    mocks.insert.mockReset();
    mocks.insert.mockReturnValue({ values: async () => ({}) });
    mocks.db = {
      execute: mocks.execute,
      select: mocks.select,
      insert: mocks.insert,
    };
    mocks.getDb.mockResolvedValue(mocks.db);
    mocks.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: async () => [{ id: tenantB }] }) }),
    });
  });

  it("returns the canonical P0 hold only after a same-tenant executive clears authorization", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("denies an ordinary executive tenant override before the object query", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 88, tenantId: tenantB })
    ).rejects.toThrow("does not match the authenticated session");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("denies an ordinary claims processor access to Executive operational detail", async () => {
    await expect(
      executiveRouter
        .createCaller(processorA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("Executive access required");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not disclose a direct foreign numeric claim identifier after the caller clears tenant authorization", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 999 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("contains the legacy high-fraud filter behind the canonical hold", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ filter: "high_fraud" })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: tenantA, isCrossTenant: false })
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("fails closed when an ordinary Executive request has no tenant context", async () => {
    await expect(
      executiveRouter
        .createCaller(executiveWithoutTenant)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("not associated with an insurer tenant");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("requires explicit tenant selection when a platform super-admin has no session tenant", async () => {
    await expect(
      executiveRouter
        .createCaller(superAdminWithoutTenant)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow("Explicit tenant selection is required");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not read the database before the P0 hold when a same-tenant request has no database", async () => {
    mocks.db = null;
    await expect(
      executiveRouter
        .createCaller(executiveA)
        .getOperationalClaimDetail({ claimId: 77 })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns the P0 hold to a platform super-admin only after explicit cross-tenant selection and audit", async () => {
    await expect(
      executiveRouter
        .createCaller(superAdmin)
        .getOperationalClaimDetail({ claimId: 88, tenantId: tenantB })
    ).rejects.toThrow(P0_B1_FRAUD_DECISION_HOLD.explanation);
    expect(mocks.validate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: tenantB, isCrossTenant: true }),
      "executive_operational_detail",
      "88",
      expect.anything()
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it.each([
    ["getFraudDetectionTrends", { days: 30 }],
    ["getFraudRiskDistribution", undefined],
    ["getEscalationQueue", undefined],
  ] as const)(
    "withholds %s after executive authorization without querying fraud data",
    async (procedure, input) => {
      const caller = executiveRouter.createCaller(executiveA) as any;
      const invoke = () =>
        input === undefined ? caller[procedure]() : caller[procedure](input);

      await expect(invoke()).rejects.toThrow(
        P0_B1_FRAUD_DECISION_HOLD.explanation
      );
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    }
  );

  it("denies an unauthorized caller before each fraud hold", async () => {
    const caller = executiveRouter.createCaller(processorA) as any;

    await expect(caller.getFraudDetectionTrends({ days: 30 })).rejects.toThrow(
      "Executive access required"
    );
    await expect(caller.getFraudRiskDistribution()).rejects.toThrow(
      "Executive access required"
    );
    await expect(caller.getEscalationQueue()).rejects.toThrow(
      "Executive access required"
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["getFraudDetectionTrends", { days: 30 }],
    ["getFraudRiskDistribution", undefined],
    ["getEscalationQueue", undefined],
  ] as const)(
    "denies a tenantless platform super-admin before %s can return a P0 hold",
    async (procedure, input) => {
      const caller = executiveRouter.createCaller(
        superAdminWithoutTenant
      ) as any;
      const invoke = () =>
        input === undefined ? caller[procedure]() : caller[procedure](input);

      await expect(invoke()).rejects.toThrow(
        "Explicit tenant selection is required for executive fraud analytics"
      );
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.execute).not.toHaveBeenCalled();
    }
  );
});

type RouteRequirement = {
  name: string;
  calls: string[];
};

const heldExecutiveRoutes: RouteRequirement[] = [
  {
    name: "getOperationalClaimDetail",
    calls: [
      "resolveP0TenantScope",
      "validateP0TenantScope",
      "auditP0CrossTenantAccess",
      "throwP0B1FraudDecisionHold",
    ],
  },
  {
    name: "getFraudDetectionTrends",
    calls: ["requireExecutiveFraudTenantScope", "throwP0B1FraudDecisionHold"],
  },
  {
    name: "getFraudRiskDistribution",
    calls: ["requireExecutiveFraudTenantScope", "throwP0B1FraudDecisionHold"],
  },
  {
    name: "getEscalationQueue",
    calls: ["requireExecutiveFraudTenantScope", "throwP0B1FraudDecisionHold"],
  },
];

function procedureBaseName(expression: ts.Expression): string | undefined {
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current)) {
    if (!ts.isPropertyAccessExpression(current.expression)) return undefined;
    current = current.expression.expression;
  }
  return ts.isIdentifier(current) ? current.text : undefined;
}

function procedureUsesMiddleware(expression: ts.Expression): boolean {
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current)) {
    if (!ts.isPropertyAccessExpression(current.expression)) return false;
    if (current.expression.name.text === "use") return true;
    current = current.expression.expression;
  }
  return false;
}

function executiveRouterObject(
  sourceFile: ts.SourceFile
): ts.ObjectLiteralExpression | undefined {
  const matches: ts.ObjectLiteralExpression[] = [];

  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some(
        modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
      )
    ) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer;
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "executiveRouter" ||
        !initializer ||
        !ts.isCallExpression(initializer) ||
        !ts.isIdentifier(initializer.expression) ||
        initializer.expression.text !== "router" ||
        !ts.isObjectLiteralExpression(initializer.arguments[0])
      ) {
        continue;
      }
      matches.push(initializer.arguments[0]);
    }
  }

  return matches.length === 1 ? matches[0] : undefined;
}

function queryCallback(
  expression: ts.Expression
): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current)) {
    if (
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "query"
    ) {
      return current.arguments.find(
        argument =>
          ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
      ) as ts.FunctionLikeDeclaration | undefined;
    }
    if (!ts.isPropertyAccessExpression(current.expression)) return undefined;
    current = current.expression.expression;
  }
  return undefined;
}

function directCall(
  expression: ts.Expression | undefined
): ts.CallExpression | undefined {
  if (!expression) return undefined;
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return ts.isCallExpression(current) && ts.isIdentifier(current.expression)
    ? current
    : undefined;
}

function topLevelCalls(
  callback: ts.FunctionLikeDeclaration
): Map<string, ts.CallExpression> {
  const calls = new Map<string, ts.CallExpression>();
  if (!ts.isBlock(callback.body)) return calls;

  function record(expression: ts.Expression | undefined): void {
    if (!expression) return;
    const call = directCall(expression);
    if (call && !calls.has(call.expression.text)) {
      calls.set(call.expression.text, call);
    }
  }

  for (const statement of callback.body.statements) {
    if (ts.isExpressionStatement(statement)) {
      record(statement.expression);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        record(declaration.initializer);
      }
    }
  }
  return calls;
}

function hasImmutableResolvedScope(
  callback: ts.FunctionLikeDeclaration
): boolean {
  if (!ts.isBlock(callback.body)) return false;

  return callback.body.statements.some(statement => {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    ) {
      return false;
    }

    return statement.declarationList.declarations.some(declaration => {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== "scope"
      ) {
        return false;
      }
      const call = directCall(declaration.initializer);
      return !!call && call.expression.text === "resolveP0TenantScope";
    });
  });
}

function crossTenantAuditCall(
  callback: ts.FunctionLikeDeclaration
): ts.CallExpression | undefined {
  if (!ts.isBlock(callback.body)) return undefined;

  for (const statement of callback.body.statements) {
    if (
      !ts.isIfStatement(statement) ||
      !ts.isPropertyAccessExpression(statement.expression) ||
      !ts.isIdentifier(statement.expression.expression) ||
      statement.expression.expression.text !== "scope" ||
      statement.expression.name.text !== "isCrossTenant"
    ) {
      continue;
    }

    const children = ts.isBlock(statement.thenStatement)
      ? statement.thenStatement.statements
      : [statement.thenStatement];
    if (children.length !== 1 || !ts.isExpressionStatement(children[0])) {
      return undefined;
    }
    if (!ts.isAwaitExpression(children[0].expression)) {
      return undefined;
    }
    const call = directCall(children[0].expression);
    if (call?.expression.getText() === "auditP0CrossTenantAccess") {
      return call;
    }
  }
  return undefined;
}

function callPosition(
  call: ts.CallExpression,
  sourceFile: ts.SourceFile
): number {
  return call.getStart(sourceFile);
}

function isContextArgument(argument: ts.Expression | undefined): boolean {
  if (argument && ts.isIdentifier(argument)) return argument.text === "ctx";
  return (
    !!argument &&
    ts.isAsExpression(argument) &&
    ts.isIdentifier(argument.expression) &&
    argument.expression.text === "ctx"
  );
}

function isIdentifierArgument(
  argument: ts.Expression | undefined,
  name: string
): boolean {
  return !!argument && ts.isIdentifier(argument) && argument.text === name;
}

function expressionStatementCall(
  statement: ts.Statement
): ts.CallExpression | undefined {
  return ts.isExpressionStatement(statement)
    ? directCall(statement.expression)
    : undefined;
}

function awaitedExpressionStatementCall(
  statement: ts.Statement
): ts.CallExpression | undefined {
  return ts.isExpressionStatement(statement) &&
    ts.isAwaitExpression(statement.expression)
    ? directCall(statement.expression)
    : undefined;
}

function namedCall(call: ts.CallExpression | undefined, name: string): boolean {
  return (
    !!call && ts.isIdentifier(call.expression) && call.expression.text === name
  );
}

function terminalShapeViolations(
  routeName: string,
  callback: ts.FunctionLikeDeclaration
): string[] {
  if (!ts.isBlock(callback.body)) {
    return [`${routeName}: route body must be a terminal held-route block`];
  }

  const statements = callback.body.statements;
  if (routeName === "getOperationalClaimDetail") {
    if (statements.length !== 4) {
      return [
        `${routeName}: must contain only resolve, validate, cross-tenant audit, then terminal canonical hold`,
      ];
    }
    const resolveStatement = statements[0];
    const validateCall = awaitedExpressionStatementCall(statements[1]);
    const auditCall = ts.isIfStatement(statements[2])
      ? crossTenantAuditCall(callback)
      : undefined;
    const holdCall = expressionStatementCall(statements[3]);
    const isResolveStatement =
      ts.isVariableStatement(resolveStatement) &&
      !!(resolveStatement.declarationList.flags & ts.NodeFlags.Const) &&
      resolveStatement.declarationList.declarations.length === 1 &&
      ts.isIdentifier(resolveStatement.declarationList.declarations[0].name) &&
      resolveStatement.declarationList.declarations[0].name.text === "scope" &&
      namedCall(
        directCall(
          resolveStatement.declarationList.declarations[0].initializer
        ),
        "resolveP0TenantScope"
      );

    return isResolveStatement &&
      namedCall(validateCall, "validateP0TenantScope") &&
      !!auditCall &&
      namedCall(holdCall, "throwP0B1FraudDecisionHold")
      ? []
      : [
          `${routeName}: must contain only resolve, validate, cross-tenant audit, then terminal canonical hold`,
        ];
  }

  if (statements.length !== 2) {
    return [
      `${routeName}: must contain only tenant scope then terminal canonical hold`,
    ];
  }
  return namedCall(
    expressionStatementCall(statements[0]),
    "requireExecutiveFraudTenantScope"
  ) &&
    namedCall(
      expressionStatementCall(statements[1]),
      "throwP0B1FraudDecisionHold"
    )
    ? []
    : [
        `${routeName}: must contain only tenant scope then terminal canonical hold`,
      ];
}

function hasNamedImport(
  sourceFile: ts.SourceFile,
  modulePath: string,
  importedName: string,
  localName = importedName
): boolean {
  return sourceFile.statements.some(statement => {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== modulePath
    ) {
      return false;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) return false;

    return bindings.elements.some(element => {
      const imported = element.propertyName?.text ?? element.name.text;
      return imported === importedName && element.name.text === localName;
    });
  });
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap(element => bindingNames(element.name));
}

function callbackShadowedNames(
  callback: ts.FunctionLikeDeclaration,
  required: Set<string>
): string[] {
  const shadows = new Set<string>();

  function record(names: string[]): void {
    for (const name of names) {
      if (required.has(name)) shadows.add(name);
    }
  }

  for (const parameter of callback.parameters) {
    record(bindingNames(parameter.name));
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionLike(node) && node !== callback) return;
    if (ts.isVariableDeclaration(node)) record(bindingNames(node.name));
    if (ts.isFunctionDeclaration(node) && node.name) record([node.name.text]);
    if (ts.isClassDeclaration(node) && node.name) record([node.name.text]);
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      record(bindingNames(node.variableDeclaration.name));
    }
    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  return [...shadows].sort();
}

function callbackBindingViolations(
  callback: ts.FunctionLikeDeclaration
): string[] {
  const violations: string[] = [];
  const parameterNames = new Set(
    callback.parameters.flatMap(parameter => bindingNames(parameter.name))
  );
  if (!parameterNames.has("ctx")) {
    violations.push("route callback must bind ctx");
  }
  if (parameterNames.has("scope")) {
    violations.push("route callback must not bind scope as a parameter");
  }

  let scopeDeclarations = 0;
  let ctxDeclarations = 0;

  function record(names: string[]): void {
    for (const name of names) {
      if (name === "scope") scopeDeclarations += 1;
      if (name === "ctx") ctxDeclarations += 1;
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionLike(node) && node !== callback) return;
    if (ts.isVariableDeclaration(node)) record(bindingNames(node.name));
    if (ts.isFunctionDeclaration(node) && node.name) record([node.name.text]);
    if (ts.isClassDeclaration(node) && node.name) record([node.name.text]);
    if (ts.isCatchClause(node) && node.variableDeclaration) {
      record(bindingNames(node.variableDeclaration.name));
    }
    ts.forEachChild(node, visit);
  }

  visit(callback.body);
  if (scopeDeclarations !== 1) {
    violations.push("route callback must bind exactly one scope");
  }
  if (ctxDeclarations !== 0) {
    violations.push("route callback must not shadow ctx");
  }
  return violations;
}

function executiveRouteGuardViolations(sourceText: string): string[] {
  const sourceFile = ts.createSourceFile(
    "executive.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const routerObject = executiveRouterObject(sourceFile);
  const violations: string[] = [];
  if (!routerObject) {
    return [
      "executiveRouter must have exactly one exported top-level router({...}) initializer",
    ];
  }

  if (
    !hasNamedImport(
      sourceFile,
      "../evidence-governance/p0FraudDecisionHold",
      "throwP0B1FraudDecisionHold"
    )
  ) {
    violations.push("canonical P0 fraud hold import is required");
  }

  if (routerObject.properties.some(ts.isSpreadAssignment)) {
    violations.push("executiveRouter must not contain spread assignments");
  }

  const assignments = new Map<string, ts.Expression>();
  for (const property of routerObject.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
    ) {
      assignments.set(property.name.text, property.initializer);
    }
  }

  for (const route of heldExecutiveRoutes) {
    const expression = assignments.get(route.name);
    if (!expression) {
      violations.push(`${route.name}: route is missing`);
      continue;
    }
    const baseProcedure = procedureBaseName(expression);
    if (baseProcedure === "p0FraudExecutiveProcedure") {
      violations.push("p0FraudExecutiveProcedure is prohibited");
    }
    if (baseProcedure !== "executiveProcedure") {
      violations.push(
        `${route.name}: must bind directly to executiveProcedure`
      );
    }
    if (procedureUsesMiddleware(expression)) {
      violations.push(`${route.name}: must not add procedure middleware`);
    }

    const callback = queryCallback(expression);
    if (!callback) {
      violations.push(`${route.name}: direct query callback is missing`);
      continue;
    }

    if (
      route.name === "getOperationalClaimDetail" &&
      !hasImmutableResolvedScope(callback)
    ) {
      violations.push(
        "getOperationalClaimDetail: must bind resolveP0TenantScope to immutable scope"
      );
    }

    if (route.name === "getOperationalClaimDetail") {
      for (const violation of callbackBindingViolations(callback)) {
        violations.push(`getOperationalClaimDetail: ${violation}`);
      }
    }

    violations.push(...terminalShapeViolations(route.name, callback));

    for (const shadow of callbackShadowedNames(
      callback,
      new Set(route.calls)
    )) {
      violations.push(`${route.name}: must not shadow ${shadow}`);
    }

    const calls = topLevelCalls(callback);
    let previous = -1;
    for (const call of route.calls) {
      const callExpression =
        call === "auditP0CrossTenantAccess"
          ? crossTenantAuditCall(callback)
          : calls.get(call);
      if (!callExpression) {
        violations.push(`${route.name}: missing call to ${call}`);
        continue;
      }
      if (
        call === "requireExecutiveFraudTenantScope" &&
        !isContextArgument(callExpression.arguments[0])
      ) {
        violations.push(`${route.name}: must scope the route ctx`);
      }
      if (
        call === "resolveP0TenantScope" &&
        !isContextArgument(callExpression.arguments[0])
      ) {
        violations.push(`${route.name}: must resolve the route ctx`);
      }
      if (
        call === "validateP0TenantScope" &&
        !isIdentifierArgument(callExpression.arguments[0], "scope")
      ) {
        violations.push(`${route.name}: validation must receive scope`);
      }
      if (
        call === "auditP0CrossTenantAccess" &&
        (!isContextArgument(callExpression.arguments[0]) ||
          !isIdentifierArgument(callExpression.arguments[1], "scope"))
      ) {
        violations.push(
          `${route.name}: audit must receive ctx and verified scope`
        );
      }
      const position = callPosition(callExpression, sourceFile);
      if (position <= previous) {
        violations.push(
          `${route.name}: ${call} must precede the next hold step`
        );
      }
      previous = position;
    }
  }

  return violations;
}

describe("P0-B1 executive wrapper reintroduction guard", () => {
  it("requires executable authorization and audit calls before every executive fraud hold", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );

    expect(executiveRouteGuardViolations(source)).toEqual([]);
  });

  it("rejects the historical shared P0 fraud wrapper before route authorization can run", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const reintroducedWrapper = source.replace(
      "getFraudDetectionTrends: executiveProcedure",
      "getFraudDetectionTrends: p0FraudExecutiveProcedure"
    );

    expect(executiveRouteGuardViolations(reintroducedWrapper)).toContain(
      "p0FraudExecutiveProcedure is prohibited"
    );
    expect(executiveRouteGuardViolations(reintroducedWrapper)).toContain(
      "getFraudDetectionTrends: must bind directly to executiveProcedure"
    );
  });

  it("rejects t.middleware composition that would preempt route-local authorization", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const reintroducedMiddleware = source.replace(
      "getFraudDetectionTrends: executiveProcedure",
      "getFraudDetectionTrends: executiveProcedure.use(t.middleware(() => throwP0B1FraudDecisionHold()))"
    );

    expect(executiveRouteGuardViolations(reintroducedMiddleware)).toContain(
      "getFraudDetectionTrends: must not add procedure middleware"
    );
  });

  it("does not accept an uninvoked nested authorization callback", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "requireExecutiveFraudTenantScope(ctx);",
      "const authorize = () => requireExecutiveFraudTenantScope(ctx);\n      void authorize;"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getFraudDetectionTrends: missing call to requireExecutiveFraudTenantScope"
    );
  });

  it("does not accept an authorization call hidden in a non-executing conditional branch", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "requireExecutiveFraudTenantScope(ctx);",
      "if (false) { requireExecutiveFraudTenantScope(ctx); }"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getFraudDetectionTrends: missing call to requireExecutiveFraudTenantScope"
    );
  });

  it("does not accept an unreachable analytics canonical hold after an early return", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "requireExecutiveFraudTenantScope(ctx);\n      throwP0B1FraudDecisionHold();",
      "requireExecutiveFraudTenantScope(ctx);\n      return sensitiveFraudPayload;\n      throwP0B1FraudDecisionHold();"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getFraudDetectionTrends: must contain only tenant scope then terminal canonical hold"
    );
  });

  it("does not accept a callback-local shadow of the canonical fraud hold", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "requireExecutiveFraudTenantScope(ctx);\n      throwP0B1FraudDecisionHold();",
      "const throwP0B1FraudDecisionHold = () => ({ data: sensitiveFraudData, success: true });\n      requireExecutiveFraudTenantScope(ctx);\n      return throwP0B1FraudDecisionHold();"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getFraudDetectionTrends: must not shadow throwP0B1FraudDecisionHold"
    );
  });

  it("does not accept an unreachable operational-detail hold after an early return", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "      throwP0B1FraudDecisionHold();",
      "      return sensitiveFraudPayload;\n      throwP0B1FraudDecisionHold();"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getOperationalClaimDetail: must contain only resolve, validate, cross-tenant audit, then terminal canonical hold"
    );
  });

  it("rejects a later spread that overrides a held executive route", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const close = source.lastIndexOf("\n});");
    const bypass = `${source.slice(0, close)}
  ...{
    getFraudDetectionTrends: executiveProcedure.query(({ ctx }) => {
      requireExecutiveFraudTenantScope(ctx);
      return sensitiveFraudPayload;
    }),
  },${source.slice(close)}`;

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "executiveRouter must not contain spread assignments"
    );
  });

  it("requires the operational-detail audit in its cross-tenant branch", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace("if (scope.isCrossTenant) {", "if (false) {");

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getOperationalClaimDetail: missing call to auditP0CrossTenantAccess"
    );
  });

  it("does not permit a scope mutation before cross-tenant audit", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "if (scope.isCrossTenant) {\n        await auditP0CrossTenantAccess(",
      "if (scope.isCrossTenant) {\n        Object.assign(scope, { isCrossTenant: false });\n        await auditP0CrossTenantAccess("
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getOperationalClaimDetail: missing call to auditP0CrossTenantAccess"
    );
  });

  it("requires the cross-tenant audit to complete before the canonical hold", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "await auditP0CrossTenantAccess(",
      "auditP0CrossTenantAccess("
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getOperationalClaimDetail: missing call to auditP0CrossTenantAccess"
    );
  });

  it("requires selected-tenant validation to complete before audit and hold", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const bypass = source.replace(
      "await validateP0TenantScope(scope);",
      "validateP0TenantScope(scope);"
    );

    expect(executiveRouteGuardViolations(bypass)).toContain(
      "getOperationalClaimDetail: must contain only resolve, validate, cross-tenant audit, then terminal canonical hold"
    );
  });

  it("requires validation and audit to receive the exact resolved scope", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const invalidValidationScope = source.replace(
      "await validateP0TenantScope(scope);",
      "await validateP0TenantScope({ ...scope });"
    );
    const forgedAuditScope = source.replace(
      "ctx as any,\n          scope,",
      "ctx as any,\n          { ...scope, isCrossTenant: false },"
    );

    expect(executiveRouteGuardViolations(invalidValidationScope)).toContain(
      "getOperationalClaimDetail: validation must receive scope"
    );
    expect(executiveRouteGuardViolations(forgedAuditScope)).toContain(
      "getOperationalClaimDetail: audit must receive ctx and verified scope"
    );
  });

  it("requires the resolved scope binding to remain immutable", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const mutableScope = source.replace(
      "const scope = resolveP0TenantScope(",
      "let scope = resolveP0TenantScope("
    );

    expect(executiveRouteGuardViolations(mutableScope)).toContain(
      "getOperationalClaimDetail: must bind resolveP0TenantScope to immutable scope"
    );
  });

  it("does not accept an inner scope binding in the cross-tenant audit branch", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const shadowedScope = source.replace(
      "if (scope.isCrossTenant) {\n        await auditP0CrossTenantAccess(",
      "if (scope.isCrossTenant) {\n        const scope = { ...scope, isCrossTenant: false };\n        await auditP0CrossTenantAccess("
    );

    expect(executiveRouteGuardViolations(shadowedScope)).toContain(
      "getOperationalClaimDetail: route callback must bind exactly one scope"
    );
  });

  it("inspects only the actual executiveRouter assignment, not a later decoy object", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const unsafeActualRoute = source.replace(
      "getFraudDetectionTrends: executiveProcedure",
      "getFraudDetectionTrends: alternateProcedure"
    );
    const decoy = `
      const decoy = {
        getFraudDetectionTrends: executiveProcedure.query(({ ctx }) => {
          requireExecutiveFraudTenantScope(ctx);
          throwP0B1FraudDecisionHold();
        }),
      };
    `;

    expect(
      executiveRouteGuardViolations(`${unsafeActualRoute}\n${decoy}`)
    ).toContain(
      "getFraudDetectionTrends: must bind directly to executiveProcedure"
    );
  });

  it("does not accept a nested shadowed executiveRouter decoy", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "server/routers/executive.ts"),
      "utf8"
    );
    const unsafeActualRoute = source.replace(
      "getFraudDetectionTrends: executiveProcedure",
      "getFraudDetectionTrends: alternateProcedure"
    );
    const nestedDecoy = `
      function unrelated() {
        const executiveRouter = router({
          getFraudDetectionTrends: executiveProcedure.query(({ ctx }) => {
            requireExecutiveFraudTenantScope(ctx);
            throwP0B1FraudDecisionHold();
          }),
        });
        return executiveRouter;
      }
    `;

    expect(
      executiveRouteGuardViolations(`${unsafeActualRoute}\n${nestedDecoy}`)
    ).toContain(
      "getFraudDetectionTrends: must bind directly to executiveProcedure"
    );
  });

  it("does not treat comments or strings as authorization and audit calls", () => {
    const source = `
      export const executiveRouter = router({
        getOperationalClaimDetail: executiveProcedure.query(() => {
          // resolveP0TenantScope(); validateP0TenantScope(); auditP0CrossTenantAccess();
          const misleading = "resolveP0TenantScope validateP0TenantScope auditP0CrossTenantAccess";
          throwP0B1FraudDecisionHold();
        }),
      });
    `;

    expect(executiveRouteGuardViolations(source)).toContain(
      "getOperationalClaimDetail: missing call to resolveP0TenantScope"
    );
    expect(executiveRouteGuardViolations(source)).toContain(
      "getOperationalClaimDetail: missing call to auditP0CrossTenantAccess"
    );
  });
});
