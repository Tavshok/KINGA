#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(repoRoot, "drizzle/schema.ts");
const auxiliaryPath = path.join(repoRoot, "drizzle/claim-comments-schema.ts");

function fail(message) {
  throw new Error(`[claim-comment-read-canonicalization] ${message}`);
}

function extractMysqlTableDeclaration(source, declaration, physicalName) {
  const marker = `export const ${declaration} = mysqlTable("${physicalName}"`;
  const start = source.indexOf(marker);
  if (start < 0) return null;

  let quote = null;
  let escaped = false;
  let parenDepth = 0;
  let started = false;
  for (let offset = start; offset < source.length; offset += 1) {
    const character = source[offset];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") {
      parenDepth += 1;
      started = true;
      continue;
    }
    if (character === ")") {
      parenDepth -= 1;
      continue;
    }
    if (started && parenDepth === 0 && character === ";") {
      return source.slice(start, offset + 1);
    }
  }
  fail(`could not close ${declaration} (${physicalName}) declaration`);
}

function normalize(declaration) {
  return declaration
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function checksum(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeContract(declaration, sourceFile) {
  const normalizedDeclaration = normalize(declaration);
  return {
    contract: "gate-c-claim-comment-read-canonicalization-v1",
    physicalTable: "claim_comment_reads",
    declaration: "claimCommentReads",
    sourceFile,
    normalizedDeclaration,
    normalizedDeclarationSha256: checksum(normalizedDeclaration),
  };
}

function ensureCanonicalClaimMapping(canonicalSource) {
  const canonicalClaimComments = extractMysqlTableDeclaration(canonicalSource, "claimComments", "claim_comments");
  if (!canonicalClaimComments) fail("canonical drizzle/schema.ts declaration for claim_comments is absent");
  if (!/claimId:\s*int\("claimId"\)/.test(canonicalClaimComments)) {
    fail("canonical claim_comments declaration does not retain the approved claimId physical mapping");
  }
  const occurrences = canonicalSource.match(/mysqlTable\("claim_comments"/g) ?? [];
  if (occurrences.length !== 1) fail(`expected one canonical claim_comments declaration, found ${occurrences.length}`);
}

function capture(outputPath) {
  const auxiliarySource = fs.readFileSync(auxiliaryPath, "utf8");
  const declaration = extractMysqlTableDeclaration(auxiliarySource, "claimCommentReads", "claim_comment_reads");
  if (!declaration) fail("auxiliary claim_comment_reads declaration is absent before capture");
  const contract = makeContract(declaration, "drizzle/claim-comments-schema.ts");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ captured: outputPath, checksum: contract.normalizedDeclarationSha256 })}\n`);
}

function verify(contractPath) {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (contract.contract !== "gate-c-claim-comment-read-canonicalization-v1") fail("unexpected contract version");
  const canonicalSource = fs.readFileSync(canonicalPath, "utf8");
  ensureCanonicalClaimMapping(canonicalSource);
  const canonicalDeclaration = extractMysqlTableDeclaration(canonicalSource, "claimCommentReads", "claim_comment_reads");
  if (!canonicalDeclaration) fail("canonical drizzle/schema.ts declaration for claim_comment_reads is absent");
  const actual = makeContract(canonicalDeclaration, "drizzle/schema.ts");
  if (actual.normalizedDeclarationSha256 !== contract.normalizedDeclarationSha256) {
    fail("claim_comment_reads normalized declaration differs from the pre-consolidation physical contract");
  }

  if (fs.existsSync(auxiliaryPath)) {
    const auxiliarySource = fs.readFileSync(auxiliaryPath, "utf8");
    if (/mysqlTable\("claim_comments"/.test(auxiliarySource) || /mysqlTable\("claim_comment_reads"/.test(auxiliarySource)) {
      fail("the deprecated auxiliary schema still declares claim_comments or claim_comment_reads");
    }
  }
  process.stdout.write(`${JSON.stringify({
    verified: true,
    physicalTable: "claim_comment_reads",
    normalizedDeclarationSha256: actual.normalizedDeclarationSha256,
    canonicalClaimIdMapping: "claimId",
    auxiliaryTableDeclarationsRemoved: !fs.existsSync(auxiliaryPath),
  }, null, 2)}\n`);
}

const [command, argument] = process.argv.slice(2);
if (command === "capture" && argument) capture(path.resolve(repoRoot, argument));
else if (command === "verify" && argument) verify(path.resolve(repoRoot, argument));
else fail("usage: node scripts/verify-claim-comment-reads-canonicalization.mjs capture <repo-relative-output> | verify <repo-relative-contract>");
