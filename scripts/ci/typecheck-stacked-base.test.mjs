import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const wrapperPath = resolve(scriptsDir, "typecheck-stacked-base.mjs");
const comparatorPath = resolve(scriptsDir, "typecheck-baseline.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function makeFixture() {
  const fixture = await mkdtemp(
    resolve(tmpdir(), "kinga-stacked-typecheck-test-")
  );
  mkdirSync(resolve(fixture, "ci"), { recursive: true });
  mkdirSync(resolve(fixture, "node_modules"), { recursive: true });
  git(fixture, ["init", "--quiet"]);
  git(fixture, ["config", "user.name", "ci fixture"]);
  git(fixture, ["config", "user.email", "ci-fixture@example.invalid"]);
  writeFileSync(
    resolve(fixture, "package.json"),
    JSON.stringify({ scripts: { check: "node check.mjs" } })
  );
  writeFileSync(
    resolve(fixture, "check.mjs"),
    [
      'process.stderr.write("fixture.ts(1,1): error TS9999: inherited fixture diagnostic\\n");',
      "process.exitCode = 2;",
      "",
    ].join("\n")
  );
  writeFileSync(resolve(fixture, "note.txt"), "base\n");
  git(fixture, ["add", "."]);
  git(fixture, ["commit", "--quiet", "-m", "base"]);
  const base = git(fixture, ["rev-parse", "HEAD"]);
  writeFileSync(resolve(fixture, "note.txt"), "head only\n");
  git(fixture, ["add", "note.txt"]);
  git(fixture, ["commit", "--quiet", "-m", "head"]);
  return { fixture, base };
}

function runNode(cwd, args, environment = {}) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "", ...environment },
  });
}

function temporaryWorktrees(cwd) {
  return git(cwd, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter(line => line.startsWith("worktree "))
    .map(line => line.slice("worktree ".length))
    .filter(
      path =>
        path !== resolve(cwd) &&
        path.startsWith(`${tmpdir()}/kinga-stacked-typecheck-`)
    );
}

function removeTemporaryWorktrees(cwd) {
  for (const worktree of temporaryWorktrees(cwd)) {
    git(cwd, ["worktree", "remove", "--force", worktree]);
  }
}

async function makeGitShim(behavior) {
  const shimDir = await mkdtemp(resolve(tmpdir(), "kinga-stacked-git-shim-"));
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const script = `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "${behavior}" ]; then
  if [ "$2" = "add" ]; then
    "${realGit}" "$@"
  fi
  exit 73
fi
exec "${realGit}" "$@"
`;
  writeFileSync(resolve(shimDir, "git"), script);
  chmodSync(resolve(shimDir, "git"), 0o755);
  return shimDir;
}

test("compares a stack candidate against its exact ancestor base", async () => {
  const { fixture, base } = await makeFixture();
  try {
    const result = runNode(fixture, [wrapperPath, "--base-sha", base]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(
      readFileSync(resolve(fixture, "ci/typecheck-report.json"), "utf8")
    );
    assert.equal(report.baselineCount, 1);
    assert.equal(report.currentCount, 1);
    assert.deepEqual(report.newDiagnostics, []);
    assert.equal(existsSync(resolve(fixture, ".git/worktrees")), false);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("rejects package metadata drift before generating a base baseline", async () => {
  const { fixture, base } = await makeFixture();
  try {
    writeFileSync(
      resolve(fixture, "package.json"),
      JSON.stringify({
        scripts: { check: "node check.mjs" },
        fixtureDrift: true,
      })
    );
    const result = runNode(fixture, [wrapperPath, "--base-sha", base]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refuses to reuse dependencies/);
    assert.equal(
      existsSync(resolve(fixture, "ci/typecheck-report.json")),
      false
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("removes a registered worktree after worktree add reports failure", async () => {
  const { fixture, base } = await makeFixture();
  const shimDir = await makeGitShim("add");
  try {
    const result = runNode(fixture, [wrapperPath, "--base-sha", base], {
      PATH: `${shimDir}:${process.env.PATH}`,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worktree add --detach/);
    assert.deepEqual(temporaryWorktrees(fixture), []);
  } finally {
    removeTemporaryWorktrees(fixture);
    rmSync(shimDir, { recursive: true, force: true });
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("fails closed when worktree removal cannot complete", async () => {
  const { fixture, base } = await makeFixture();
  const shimDir = await makeGitShim("remove");
  try {
    const result = runNode(fixture, [wrapperPath, "--base-sha", base], {
      PATH: `${shimDir}:${process.env.PATH}`,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /worktree remove --force/);
    assert.equal(temporaryWorktrees(fixture).length, 1);
  } finally {
    removeTemporaryWorktrees(fixture);
    rmSync(shimDir, { recursive: true, force: true });
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("rejects a custom baseline path while writing a baseline", () => {
  const result = runNode(resolve(scriptsDir, "../.."), [
    comparatorPath,
    "--write-baseline",
    "--baseline-path",
    resolve(tmpdir(), "forbidden-baseline.json"),
  ]);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /--write-baseline cannot be combined with --baseline-path/
  );
});
