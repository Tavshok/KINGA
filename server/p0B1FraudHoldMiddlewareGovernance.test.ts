import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Violation = {
  line: number;
  kind: "canonical" | "local";
};

type FunctionNode =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction;

type MiddlewareFactoryReference = {
  kind: "middleware-factory-reference";
};

type BindingValue = ts.Expression | FunctionNode | MiddlewareFactoryReference;

type BindingRecord = {
  position: number;
  value: BindingValue;
};

type Bindings = {
  canonicalFunctions: Set<string>;
  canonicalNamespaces: Set<string>;
  trpcErrorFunctions: Set<string>;
  trpcErrorNamespaces: Set<string>;
  functions: Map<string, FunctionNode>;
  functionAliases: Map<string, string>;
  middlewareFactories: Map<string, ts.CallExpression>;
  history: Map<string, BindingRecord[]>;
};

function isFunctionNode(node: ts.Node): node is FunctionNode {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function isMiddlewareFactoryReference(
  value: BindingValue
): value is MiddlewareFactoryReference {
  return "kind" in value && value.kind === "middleware-factory-reference";
}

function unwrapTransparentExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function callPropertyName(call: ts.CallExpression): string | undefined {
  const callee = unwrapTransparentExpression(call.expression);
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

function isMiddlewareFactoryPropertyReference(
  expression: ts.Expression
): boolean {
  const value = unwrapTransparentExpression(expression);
  return (
    ts.isPropertyAccessExpression(value) && value.name.text === "middleware"
  );
}

function isCanonicalReference(node: ts.Node, bindings: Bindings): boolean {
  if (ts.isExpression(node)) {
    node = unwrapTransparentExpression(node);
  }
  if (ts.isIdentifier(node)) {
    return bindings.canonicalFunctions.has(node.text);
  }

  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    resolvesToNamespace(
      node.expression.text,
      bindings.canonicalNamespaces,
      bindings
    ) &&
    (node.name.text === "throwP0B1FraudDecisionHold" ||
      node.name.text === "buildP0B1FraudDecisionHold")
  );
}

function isTrpcErrorReference(node: ts.Node, bindings: Bindings): boolean {
  if (ts.isExpression(node)) {
    node = unwrapTransparentExpression(node);
  }
  if (ts.isIdentifier(node)) {
    return bindings.trpcErrorFunctions.has(node.text);
  }

  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    resolvesToNamespace(
      node.expression.text,
      bindings.trpcErrorNamespaces,
      bindings
    ) &&
    node.name.text === "TRPCError"
  );
}

function resolvesToNamespace(
  name: string,
  namespaces: Set<string>,
  bindings: Bindings
): boolean {
  const visited = new Set<string>();
  let current = name;

  while (!visited.has(current)) {
    visited.add(current);
    if (namespaces.has(current)) return true;
    const alias = bindings.functionAliases.get(current);
    if (!alias) return false;
    current = alias;
  }

  return false;
}

function collectBindings(sourceFile: ts.SourceFile): Bindings {
  const bindings: Bindings = {
    canonicalFunctions: new Set<string>(),
    canonicalNamespaces: new Set<string>(),
    trpcErrorFunctions: new Set<string>(),
    trpcErrorNamespaces: new Set<string>(),
    functions: new Map<string, FunctionNode>(),
    functionAliases: new Map<string, string>(),
    middlewareFactories: new Map<string, ts.CallExpression>(),
    history: new Map<string, BindingRecord[]>(),
  };

  function recordIdentifierBinding(
    name: string,
    initializer: BindingValue,
    position: number
  ): void {
    const value = isMiddlewareFactoryReference(initializer)
      ? initializer
      : ts.isExpression(initializer)
        ? unwrapTransparentExpression(initializer)
        : initializer;
    const history = bindings.history.get(name) ?? [];
    history.push({ position, value });
    bindings.history.set(name, history);
    bindings.functions.delete(name);
    bindings.functionAliases.delete(name);
    bindings.middlewareFactories.delete(name);
    bindings.canonicalFunctions.delete(name);
    bindings.trpcErrorFunctions.delete(name);

    if (!isMiddlewareFactoryReference(value)) {
      if (isFunctionNode(value)) {
        bindings.functions.set(name, value);
      }
      if (ts.isIdentifier(value)) {
        bindings.functionAliases.set(name, value.text);
      }
      if (
        ts.isCallExpression(value) &&
        callPropertyName(value) === "middleware"
      ) {
        bindings.middlewareFactories.set(name, value);
      }
      if (!isFunctionNode(value) && isCanonicalReference(value, bindings)) {
        bindings.canonicalFunctions.add(name);
      }
      if (!isFunctionNode(value) && isTrpcErrorReference(value, bindings)) {
        bindings.trpcErrorFunctions.add(name);
      }
    }
  }

  function isModuleScope(node: ts.Node): boolean {
    let current = node.parent;
    while (current && !ts.isSourceFile(current)) {
      if (
        ts.isFunctionLike(current) ||
        ts.isBlock(current) ||
        ts.isCaseBlock(current)
      ) {
        return false;
      }
      current = current.parent;
    }
    return !!current;
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const moduleName = node.moduleSpecifier.getText(sourceFile);
      const importClause = node.importClause;
      const namedBindings = importClause?.namedBindings;

      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (
            moduleName.includes("p0FraudDecisionHold") &&
            (imported === "throwP0B1FraudDecisionHold" ||
              imported === "buildP0B1FraudDecisionHold")
          ) {
            bindings.canonicalFunctions.add(element.name.text);
          }
          if (moduleName.includes("@trpc/server") && imported === "TRPCError") {
            bindings.trpcErrorFunctions.add(element.name.text);
          }
        }
      }

      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        if (moduleName.includes("p0FraudDecisionHold")) {
          bindings.canonicalNamespaces.add(namedBindings.name.text);
        }
        if (moduleName.includes("@trpc/server")) {
          bindings.trpcErrorNamespaces.add(namedBindings.name.text);
        }
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name && isModuleScope(node)) {
      recordIdentifierBinding(node.name.text, node, node.getStart(sourceFile));
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      isModuleScope(node)
    ) {
      recordIdentifierBinding(
        node.name.text,
        isMiddlewareFactoryPropertyReference(node.initializer)
          ? { kind: "middleware-factory-reference" }
          : node.initializer,
        node.getStart(sourceFile)
      );
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      isModuleScope(node)
    ) {
      const initializer = unwrapTransparentExpression(node.initializer);
      if (!ts.isIdentifier(initializer)) {
        ts.forEachChild(node, visit);
        return;
      }
      const canonicalNamespace = resolvesToNamespace(
        initializer.text,
        bindings.canonicalNamespaces,
        bindings
      );
      const trpcErrorNamespace = resolvesToNamespace(
        initializer.text,
        bindings.trpcErrorNamespaces,
        bindings
      );

      for (const element of node.name.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        const imported =
          element.propertyName &&
          (ts.isIdentifier(element.propertyName) ||
            ts.isStringLiteral(element.propertyName))
            ? element.propertyName.text
            : element.name.text;

        if (
          canonicalNamespace &&
          (imported === "throwP0B1FraudDecisionHold" ||
            imported === "buildP0B1FraudDecisionHold")
        ) {
          bindings.canonicalFunctions.add(element.name.text);
        }
        if (trpcErrorNamespace && imported === "TRPCError") {
          bindings.trpcErrorFunctions.add(element.name.text);
        }
        if (imported === "middleware") {
          recordIdentifierBinding(
            element.name.text,
            { kind: "middleware-factory-reference" },
            node.getStart(sourceFile)
          );
        }
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left) &&
      isModuleScope(node)
    ) {
      recordIdentifierBinding(
        node.left.text,
        isMiddlewareFactoryPropertyReference(node.right)
          ? { kind: "middleware-factory-reference" }
          : node.right,
        node.getStart(sourceFile)
      );
    }

    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      recordIdentifierBinding(statement.name.text, statement, -1);
    }
  }
  visit(sourceFile);
  return bindings;
}

function isMiddlewareUse(call: ts.CallExpression): boolean {
  return callPropertyName(call) === "use";
}

function bindingAt(
  name: string,
  position: number,
  bindings: Bindings
): BindingRecord | undefined {
  const history = bindings.history.get(name) ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].position < position) return history[index];
  }
  return undefined;
}

function isMiddlewareFactoryReferenceAt(
  expression: ts.Expression,
  position: number,
  bindings: Bindings,
  visited = new Set<string>()
): boolean {
  const value = unwrapTransparentExpression(expression);
  if (isMiddlewareFactoryPropertyReference(value)) return true;
  if (!ts.isIdentifier(value)) return false;

  const key = `${value.text}:${position}`;
  if (visited.has(key)) return false;
  visited.add(key);

  const binding = bindingAt(value.text, position, bindings);
  if (!binding) return false;
  if (isMiddlewareFactoryReference(binding.value)) return true;
  return ts.isExpression(binding.value)
    ? isMiddlewareFactoryReferenceAt(
        binding.value,
        binding.position,
        bindings,
        visited
      )
    : false;
}

function isMiddlewareFactoryCallAt(
  call: ts.CallExpression,
  position: number,
  bindings: Bindings
): boolean {
  return isMiddlewareFactoryReferenceAt(call.expression, position, bindings);
}

function resolveFunctionAt(
  name: string,
  position: number,
  bindings: Bindings,
  visited = new Set<string>()
): FunctionNode | undefined {
  const key = `${name}:${position}`;
  if (visited.has(key)) return undefined;
  visited.add(key);

  const binding = bindingAt(name, position, bindings);
  if (!binding) return undefined;
  if (isMiddlewareFactoryReference(binding.value)) return undefined;
  if (isFunctionNode(binding.value)) return binding.value;
  if (ts.isIdentifier(binding.value)) {
    return resolveFunctionAt(
      binding.value.text,
      binding.position,
      bindings,
      visited
    );
  }
  return undefined;
}

function resolveFunctionLatest(
  name: string,
  bindings: Bindings,
  visited = new Set<string>()
): FunctionNode | undefined {
  if (visited.has(name)) return undefined;
  visited.add(name);

  const history = bindings.history.get(name) ?? [];
  const binding = history.at(-1);
  if (!binding) return undefined;
  if (isMiddlewareFactoryReference(binding.value)) return undefined;
  if (isFunctionNode(binding.value)) return binding.value;
  if (ts.isIdentifier(binding.value)) {
    return resolveFunctionLatest(binding.value.text, bindings, visited);
  }
  return undefined;
}

function middlewareCallbacksAt(
  argument: ts.Expression,
  capturePosition: number,
  bindings: Bindings
): FunctionNode[] {
  if (ts.isParenthesizedExpression(argument)) {
    return middlewareCallbacksAt(
      argument.expression,
      capturePosition,
      bindings
    );
  }
  if (isFunctionNode(argument)) return [argument];

  if (ts.isIdentifier(argument)) {
    const binding = bindingAt(argument.text, capturePosition, bindings);
    if (!binding) return [];
    if (isMiddlewareFactoryReference(binding.value)) return [];
    if (isFunctionNode(binding.value)) return [binding.value];
    if (ts.isIdentifier(binding.value)) {
      return middlewareCallbacksAt(binding.value, binding.position, bindings);
    }
    if (
      ts.isCallExpression(binding.value) &&
      isMiddlewareFactoryCallAt(binding.value, binding.position, bindings)
    ) {
      return binding.value.arguments.flatMap(callbackArgument =>
        middlewareCallbacksAt(callbackArgument, binding.position, bindings)
      );
    }
    return [];
  }

  if (
    ts.isCallExpression(argument) &&
    isMiddlewareFactoryCallAt(argument, capturePosition, bindings)
  ) {
    return argument.arguments.flatMap(callbackArgument =>
      middlewareCallbacksAt(callbackArgument, argument.getStart(), bindings)
    );
  }

  return [];
}

function canonicalHoldCall(
  node: ts.Node,
  bindings: Bindings,
  isLocalCanonicalReference: (expression: ts.Expression) => boolean
): boolean {
  if (!ts.isCallExpression(node)) return false;
  return (
    isCanonicalReference(node.expression, bindings) ||
    isLocalCanonicalReference(node.expression)
  );
}

function isTrpcError(
  node: ts.NewExpression,
  bindings: Bindings,
  isLocalTrpcErrorReference: (expression: ts.Expression) => boolean
): boolean {
  return (
    isTrpcErrorReference(node.expression, bindings) ||
    isLocalTrpcErrorReference(node.expression)
  );
}

function localFraudHold(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  bindings: Bindings,
  isLocalTrpcErrorReference: (expression: ts.Expression) => boolean
): boolean {
  if (
    !ts.isNewExpression(node) ||
    !isTrpcError(node, bindings, isLocalTrpcErrorReference)
  ) {
    return false;
  }

  const text = node.getText(sourceFile).toLowerCase();
  return text.includes("precondition_failed") && text.includes("fraud");
}

type CallbackAliasKind =
  | "canonical"
  | "canonical-namespace"
  | "trpc-error"
  | "trpc-error-namespace";
type CallbackAliasRecord = {
  position: number;
  kind: CallbackAliasKind | undefined;
};
type CallbackAliasHistory = Map<string, CallbackAliasRecord[]>;

function callbackLocalAliases(
  functionNode: FunctionNode,
  bindings: Bindings
): CallbackAliasHistory {
  const aliases: CallbackAliasHistory = new Map();
  if (!ts.isBlock(functionNode.body)) return aliases;

  function aliasAt(
    name: string,
    position: number
  ): CallbackAliasKind | undefined {
    const history = aliases.get(name) ?? [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index].position < position) return history[index].kind;
    }
    return undefined;
  }

  function aliasKind(
    initializer: ts.Expression,
    position: number
  ): CallbackAliasKind | undefined {
    const value = unwrapTransparentExpression(initializer);
    if (isCanonicalReference(value, bindings)) return "canonical";
    if (isTrpcErrorReference(value, bindings)) return "trpc-error";
    if (
      ts.isIdentifier(value) &&
      resolvesToNamespace(value.text, bindings.canonicalNamespaces, bindings)
    ) {
      return "canonical-namespace";
    }
    if (
      ts.isIdentifier(value) &&
      resolvesToNamespace(value.text, bindings.trpcErrorNamespaces, bindings)
    ) {
      return "trpc-error-namespace";
    }
    return ts.isIdentifier(value) ? aliasAt(value.text, position) : undefined;
  }

  function record(
    name: string,
    initializer: ts.Expression | undefined,
    position: number
  ): void {
    const history = aliases.get(name) ?? [];
    history.push({
      position,
      kind: initializer ? aliasKind(initializer, position) : undefined,
    });
    aliases.set(name, history);
  }

  for (const statement of functionNode.body.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        record(
          declaration.name.text,
          declaration.initializer,
          declaration.getStart()
        );
      }
    }
    if (
      ts.isExpressionStatement(statement) &&
      ts.isBinaryExpression(statement.expression) &&
      statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(statement.expression.left)
    ) {
      record(
        statement.expression.left.text,
        statement.expression.right,
        statement.getStart()
      );
    }
  }

  return aliases;
}

function callbackLocalAliasAt(
  aliases: CallbackAliasHistory,
  name: string,
  position: number
): CallbackAliasKind | undefined {
  const history = aliases.get(name) ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].position < position) return history[index].kind;
  }
  return undefined;
}

function hasNestedBlockBinding(
  expression: ts.Expression,
  functionNode: FunctionNode,
  name: string
): boolean {
  let current: ts.Node | undefined = expression.parent;
  while (current && current !== functionNode.body) {
    if (ts.isBlock(current)) {
      for (const statement of current.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        if (
          statement.declarationList.declarations.some(
            declaration =>
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === name
          )
        ) {
          return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
}

function middlewareViolations(
  sourceText: string,
  fileName = "router.ts"
): Violation[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const bindings = collectBindings(sourceFile);
  const violations = new Map<string, Violation>();
  const inspectedFunctions = new Set<FunctionNode>();

  function record(node: ts.Node, kind: Violation["kind"]): void {
    const line =
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
      1;
    violations.set(`${line}:${kind}`, { line, kind });
  }

  function inspectFunction(functionNode: FunctionNode): void {
    if (inspectedFunctions.has(functionNode)) return;
    inspectedFunctions.add(functionNode);
    const localAliases = callbackLocalAliases(functionNode, bindings);
    const localAliasKind = (
      identifier: ts.Identifier
    ): CallbackAliasKind | undefined =>
      hasNestedBlockBinding(identifier, functionNode, identifier.text)
        ? undefined
        : callbackLocalAliasAt(
            localAliases,
            identifier.text,
            identifier.getStart(sourceFile)
          );
    const isLocalCanonicalReference = (expression: ts.Expression): boolean => {
      const value = unwrapTransparentExpression(expression);
      if (ts.isIdentifier(value)) return localAliasKind(value) === "canonical";
      return (
        ts.isPropertyAccessExpression(value) &&
        ts.isIdentifier(value.expression) &&
        localAliasKind(value.expression) === "canonical-namespace" &&
        (value.name.text === "throwP0B1FraudDecisionHold" ||
          value.name.text === "buildP0B1FraudDecisionHold")
      );
    };
    const isLocalTrpcErrorReference = (expression: ts.Expression): boolean => {
      const value = unwrapTransparentExpression(expression);
      if (ts.isIdentifier(value)) return localAliasKind(value) === "trpc-error";
      return (
        ts.isPropertyAccessExpression(value) &&
        ts.isIdentifier(value.expression) &&
        localAliasKind(value.expression) === "trpc-error-namespace" &&
        value.name.text === "TRPCError"
      );
    };

    function visit(node: ts.Node): void {
      if (node !== functionNode.body && ts.isFunctionLike(node)) return;
      if (canonicalHoldCall(node, bindings, isLocalCanonicalReference)) {
        record(node, "canonical");
      }
      if (
        localFraudHold(node, sourceFile, bindings, isLocalTrpcErrorReference)
      ) {
        record(node, "local");
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const helper = resolveFunctionLatest(node.expression.text, bindings);
        if (helper) inspectFunction(helper);
      }
      ts.forEachChild(node, visit);
    }

    visit(functionNode.body);
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isMiddlewareUse(node)) {
      for (const argument of node.arguments) {
        for (const callback of middlewareCallbacksAt(
          argument,
          node.getStart(sourceFile),
          bindings
        )) {
          inspectFunction(callback);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...violations.values()].sort(
    (left, right) =>
      left.line - right.line || left.kind.localeCompare(right.kind)
  );
}

function routerSources(root = path.resolve(process.cwd(), "server")): string[] {
  const paths: string[] = [];
  const excludedDirectories = new Set([
    "node_modules",
    "dist",
    "build",
    "coverage",
    "generated",
    "__generated__",
    "scripts",
    "test-results",
  ]);

  function isTestLikePath(entryPath: string): boolean {
    const relativePath = path.relative(root, entryPath).replaceAll("\\", "/");
    return /(^|[/._-])(test|tests|spec)([/._-]|$)/u.test(relativePath);
  }

  function visit(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name) || isTestLikePath(entryPath)) {
          continue;
        }
        visit(entryPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !isTestLikePath(entryPath)
      ) {
        paths.push(entryPath);
      }
    }
  }

  visit(root);
  return paths;
}

describe("P0-B1 fraud-hold middleware governance", () => {
  it("detects a canonical P0 fraud hold placed in an inline shared procedure middleware callback", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        throwP0B1FraudDecisionHold();
      });
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a callback-local alias of the canonical fraud hold", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        const hold = throwP0B1FraudDecisionHold;
        hold();
      });
    `);

    expect(violations).toEqual([{ line: 5, kind: "canonical" }]);
  });

  it("detects a callback-local alias of TRPCError used for a fraud hold", () => {
    const violations = middlewareViolations(`
      import { TRPCError } from "@trpc/server";
      const heldProcedure = executiveProcedure.use(() => {
        const HeldError = TRPCError;
        throw new HeldError({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
    `);

    expect(violations).toEqual([{ line: 5, kind: "local" }]);
  });

  it("detects a callback-local canonical-hold namespace alias", () => {
    const violations = middlewareViolations(`
      import * as fraudHold from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        const hold = fraudHold;
        hold.throwP0B1FraudDecisionHold();
      });
    `);

    expect(violations).toEqual([{ line: 5, kind: "canonical" }]);
  });

  it("detects a callback-local TRPCError namespace alias used for a fraud hold", () => {
    const violations = middlewareViolations(`
      import * as rpc from "@trpc/server";
      const heldProcedure = executiveProcedure.use(() => {
        const rpcAlias = rpc;
        throw new rpcAlias.TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
    `);

    expect(violations).toEqual([{ line: 5, kind: "local" }]);
  });

  it("detects a callback-local reassignment to a canonical-hold namespace", () => {
    const violations = middlewareViolations(`
      import * as fraudHold from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        let hold = {};
        hold = fraudHold;
        hold.throwP0B1FraudDecisionHold();
      });
    `);

    expect(violations).toEqual([{ line: 6, kind: "canonical" }]);
  });

  it("detects a callback-local reassignment to a TRPCError namespace", () => {
    const violations = middlewareViolations(`
      import * as rpc from "@trpc/server";
      const heldProcedure = executiveProcedure.use(() => {
        let rpcAlias = {};
        rpcAlias = rpc;
        throw new rpcAlias.TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
    `);

    expect(violations).toEqual([{ line: 6, kind: "local" }]);
  });

  it("detects a callback-local reassignment to the canonical fraud hold", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        let hold = () => undefined;
        hold = throwP0B1FraudDecisionHold;
        hold();
      });
    `);

    expect(violations).toEqual([{ line: 6, kind: "canonical" }]);
  });

  it("detects a callback-local reassignment to TRPCError used for a fraud hold", () => {
    const violations = middlewareViolations(`
      import { TRPCError } from "@trpc/server";
      const heldProcedure = executiveProcedure.use(() => {
        let HeldError = Error;
        HeldError = TRPCError;
        throw new HeldError({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
    `);

    expect(violations).toEqual([{ line: 6, kind: "local" }]);
  });

  it("does not retain a stale callback-local canonical alias after reassignment", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        let hold = throwP0B1FraudDecisionHold;
        hold = () => undefined;
        hold();
      });
    `);

    expect(violations).toEqual([]);
  });

  it("does not apply an outer callback alias to a shadowed nested function", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        const hold = throwP0B1FraudDecisionHold;
        function unrelated() {
          const hold = () => undefined;
          hold();
        }
      });
    `);

    expect(violations).toEqual([]);
  });

  it("does not apply an outer callback alias to a shadowed nested block", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => {
        const hold = throwP0B1FraudDecisionHold;
        if (enabled) {
          const hold = () => undefined;
          hold();
        }
      });
    `);

    expect(violations).toEqual([]);
  });

  it("detects a canonical hold in a parenthesized inline middleware callback", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use((async ({ ctx, next }) => {
        throwP0B1FraudDecisionHold();
        return next({ ctx });
      }));
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a canonical hold through a parenthesized .use callee", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = (executiveProcedure.use)(() => throwP0B1FraudDecisionHold());
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a parenthesized module callback captured by middleware", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = (() => throwP0B1FraudDecisionHold());
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a parenthesized module middleware factory", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = (t.middleware(() => throwP0B1FraudDecisionHold()));
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a canonical hold through a parenthesized t.middleware callee", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = (t.middleware)(() => throwP0B1FraudDecisionHold());
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a canonical hold through an aliased middleware factory", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const middleware = t.middleware;
      const preempt = middleware(() => throwP0B1FraudDecisionHold());
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a canonical hold through a destructured middleware factory", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const { middleware } = t;
      const preempt = middleware(() => throwP0B1FraudDecisionHold());
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a parenthesized canonical hold callee", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(() => (throwP0B1FraudDecisionHold)());
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a parenthesized local TRPCError constructor", () => {
    const violations = middlewareViolations(`
      import { TRPCError } from "@trpc/server";
      const heldProcedure = executiveProcedure.use(() => {
        throw new (TRPCError)({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
    `);

    expect(violations).toEqual([{ line: 4, kind: "local" }]);
  });

  it("detects a canonical P0 fraud hold through an aliased namespace import and named middleware callback", () => {
    const violations = middlewareViolations(`
      import * as fraudHold from "../evidence-governance/p0FraudDecisionHold";
      const preempt = () => fraudHold.throwP0B1FraudDecisionHold();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a namespace-object alias inside a named middleware factory binding", () => {
    const violations = middlewareViolations(`
      import * as fraudHold from "../evidence-governance/p0FraudDecisionHold";
      const hold = fraudHold;
      const preempt = t.middleware(() => hold.throwP0B1FraudDecisionHold());
      const rebound = preempt;
      const heldProcedure = executiveProcedure.use(rebound);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a destructured canonical hold binding with a rebinding hop", () => {
    const violations = middlewareViolations(`
      import * as fraudHold from "../evidence-governance/p0FraudDecisionHold";
      const { throwP0B1FraudDecisionHold: hold } = fraudHold;
      const rebound = hold;
      const preempt = () => rebound();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 5, kind: "canonical" }]);
  });

  it("detects a locally rebound canonical hold helper in an indirect middleware callback", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold as canonicalHold } from "../evidence-governance/p0FraudDecisionHold";
      const held = canonicalHold;
      const preempt = () => held();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a direct alias chain for a named middleware callback", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = () => throwP0B1FraudDecisionHold();
      const rebound = preempt;
      const heldProcedure = executiveProcedure.use(rebound);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a hoisted module function captured before its textual declaration", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(preempt);
      function preempt() { throwP0B1FraudDecisionHold(); }
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a reassigned middleware callback that becomes a canonical hold", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      let preempt = () => undefined;
      preempt = () => throwP0B1FraudDecisionHold();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("preserves the callback binding captured when .use registers middleware", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      let preempt = () => throwP0B1FraudDecisionHold();
      const heldProcedure = executiveProcedure.use(preempt);
      preempt = () => undefined;
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("preserves an alias snapshot captured before its source callback is reassigned", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      let preempt = () => throwP0B1FraudDecisionHold();
      const alias = preempt;
      preempt = () => undefined;
      const heldProcedure = executiveProcedure.use(alias);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a reassigned local helper used by middleware", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      let helper = () => undefined;
      helper = throwP0B1FraudDecisionHold;
      const preempt = () => helper();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 5, kind: "canonical" }]);
  });

  it("detects a helper that becomes a canonical hold after callback registration", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      let helper = () => undefined;
      const preempt = () => helper();
      const heldProcedure = executiveProcedure.use(preempt);
      helper = throwP0B1FraudDecisionHold;
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("retains the module helper captured by middleware despite an unrelated nested shadow", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const helper = throwP0B1FraudDecisionHold;
      const preempt = () => helper();
      function unrelated() { const helper = () => undefined; }
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("does not promote an unrelated nested hold helper into a module callback", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const helper = () => undefined;
      const preempt = () => helper();
      function unrelated() { const helper = throwP0B1FraudDecisionHold; }
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([]);
  });

  it("detects a canonical hold inside direct t.middleware composition", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const heldProcedure = executiveProcedure.use(
        t.middleware(() => throwP0B1FraudDecisionHold())
      );
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a canonical hold inside a named t.middleware factory binding", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = t.middleware(() => {
        throwP0B1FraudDecisionHold();
      });
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "canonical" }]);
  });

  it("detects a direct alias of a named t.middleware factory binding", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const preempt = t.middleware(() => throwP0B1FraudDecisionHold());
      const rebound = preempt;
      const heldProcedure = executiveProcedure.use(rebound);
    `);

    expect(violations).toEqual([{ line: 3, kind: "canonical" }]);
  });

  it("detects a local fraud hold through an aliased TRPCError import and helper callback", () => {
    const violations = middlewareViolations(`
      import { TRPCError as ErrorClass } from "@trpc/server";
      const withLocalFraudHold = () => {
        throw new ErrorClass({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      };
      const preempt = () => withLocalFraudHold();
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 4, kind: "local" }]);
  });

  it("detects a locally rebound namespace TRPCError constructor in middleware", () => {
    const violations = middlewareViolations(`
      import * as rpc from "@trpc/server";
      const ErrorClass = rpc.TRPCError;
      const preempt = () => {
        throw new ErrorClass({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      };
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 5, kind: "local" }]);
  });

  it("detects a namespace-object alias for a local TRPCError fraud hold", () => {
    const violations = middlewareViolations(`
      import * as rpc from "@trpc/server";
      const rpcAlias = rpc;
      const preempt = t.middleware(() => {
        throw new rpcAlias.TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      });
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 5, kind: "local" }]);
  });

  it("detects a destructured TRPCError binding for a local fraud hold", () => {
    const violations = middlewareViolations(`
      import * as rpc from "@trpc/server";
      const { TRPCError: ErrorClass } = rpc;
      const preempt = () => {
        throw new ErrorClass({
          code: "PRECONDITION_FAILED",
          message: "Fraud output is withheld",
        });
      };
      const heldProcedure = executiveProcedure.use(preempt);
    `);

    expect(violations).toEqual([{ line: 5, kind: "local" }]);
  });

  it("permits canonical fraud holds in a direct route handler after local authorization", () => {
    const violations = middlewareViolations(`
      import { throwP0B1FraudDecisionHold } from "../evidence-governance/p0FraudDecisionHold";
      const route = executiveProcedure.query(({ ctx }) => {
        requireExecutiveFraudTenantScope(ctx);
        throwP0B1FraudDecisionHold();
      });
    `);

    expect(violations).toEqual([]);
  });

  it("scans only non-test, non-generated server sources", () => {
    const root = fs.mkdtempSync(path.join(process.cwd(), ".p0-b1-scan-"));
    try {
      for (const relativePath of [
        "router.ts",
        "router.test.ts",
        "debug-test.ts",
        "scripts/diagnostic.ts",
        "generated/client.ts",
        "dist/bundle.ts",
        "coverage/summary.ts",
        "node_modules/dependency.ts",
      ]) {
        const target = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "export const value = 1;\n");
      }

      expect(
        routerSources(root).map(filePath => path.relative(root, filePath))
      ).toEqual(["router.ts"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("forbids every canonical or local P0 fraud hold in server procedure middleware", () => {
    const violations = routerSources().flatMap(filePath =>
      middlewareViolations(fs.readFileSync(filePath, "utf8"), filePath).map(
        violation =>
          `${path.relative(process.cwd(), filePath)}:${violation.line}:${violation.kind}`
      )
    );

    expect(violations).toEqual([]);
  });
});

export { middlewareViolations };
