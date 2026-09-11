import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const schemaPath = path.join(repoRoot, "drizzle/schema.ts");
const classificationPath = path.join(repoRoot, "audit/gate-c-scratch-baseline/auto-increment-primary-key-classification.json");

type Candidate = {
  declaration: string;
  tableName: string;
};

function sourceIdExpressions(): Map<string, string> {
  const text = fs.readFileSync(schemaPath, "utf8");
  const sourceFile = ts.createSourceFile(schemaPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const idExpressions = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) continue;
      if (!ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== "mysqlTable") continue;
      const columns = declaration.initializer.arguments[1];
      if (!columns || !ts.isObjectLiteralExpression(columns)) continue;
      const id = columns.properties.find((property) =>
        ts.isPropertyAssignment(property)
        && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
        && property.name.text === "id",
      );
      if (id && ts.isPropertyAssignment(id)) idExpressions.set(declaration.name.text, id.initializer.getText(sourceFile));
    }
  }
  return idExpressions;
}

describe("Gate C classified global primary-key contract", () => {
  const classification = JSON.parse(fs.readFileSync(classificationPath, "utf8")) as {
    candidateCount: number;
    safeSoleIdentifierCount: number;
    heldForContractDecisionCount: number;
    safeSoleIdentifiers: Candidate[];
    heldForContractDecision: Candidate[];
    status: string;
  };

  it("accounts for all pre-reconciliation candidates and keeps the safe/held sets disjoint", () => {
    expect(classification.status).toBe("classification_complete");
    expect(classification.candidateCount).toBe(145);
    expect(classification.safeSoleIdentifierCount + classification.heldForContractDecisionCount).toBe(145);
    const safe = new Set(classification.safeSoleIdentifiers.map(({ declaration }) => declaration));
    expect(classification.heldForContractDecision.every(({ declaration }) => !safe.has(declaration))).toBe(true);
  });

  it("adds primary keys only to classified sole-identifier auto-increment ids", () => {
    const idExpressions = sourceIdExpressions();
    for (const { declaration, tableName } of classification.safeSoleIdentifiers) {
      const expression = idExpressions.get(declaration);
      expect(expression, `${tableName}.id must remain auto-increment`).toContain(".autoincrement()");
      expect(expression, `${tableName}.id must be an explicit primary key`).toContain(".primaryKey()");
    }
  });

  it("leaves every composite, junction, or alternative-identity exception unaltered", () => {
    const idExpressions = sourceIdExpressions();
    for (const { declaration, tableName } of classification.heldForContractDecision) {
      const expression = idExpressions.get(declaration);
      expect(expression, `${tableName}.id must remain auto-increment`).toContain(".autoincrement()");
      expect(expression, `${tableName}.id must remain held from the global fix`).not.toContain(".primaryKey()");
    }
  });
});
