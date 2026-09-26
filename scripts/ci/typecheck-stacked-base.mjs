import { existsSync, lstatSync, rmSync, symlinkSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const baseShaFlag = args.indexOf("--base-sha");
const baseSha = args[baseShaFlag + 1];
const cwd = process.cwd();
const comparatorPath = fileURLToPath(
  new URL("./typecheck-baseline.mjs", import.meta.url)
);

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? cwd,
    encoding: "utf8",
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env,
  });
  if (result.error) throw result.error;
  return result;
}

function assertSuccessful(command, commandArgs, options) {
  const result = run(command, commandArgs, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${commandArgs.join(" ")} failed with status ${result.status ?? "unknown"}.`
    );
  }
}

function registeredWorktreePaths() {
  const result = run("git", ["worktree", "list", "--porcelain"], {
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error("Unable to inspect Git worktree registration for cleanup.");
  }
  return (result.stdout ?? "")
    .split("\n")
    .filter(line => line.startsWith("worktree "))
    .map(line => resolve(line.slice("worktree ".length)));
}

function cleanupWorktree(worktree) {
  const normalizedWorktree = resolve(worktree);
  if (registeredWorktreePaths().includes(normalizedWorktree)) {
    assertSuccessful("git", [
      "worktree",
      "remove",
      "--force",
      normalizedWorktree,
    ]);
  }

  rmSync(normalizedWorktree, { recursive: true, force: true });

  if (registeredWorktreePaths().includes(normalizedWorktree)) {
    throw new Error(
      `Temporary stacked typecheck worktree remains registered after cleanup: ${normalizedWorktree}`
    );
  }
  if (existsSync(normalizedWorktree)) {
    throw new Error(
      `Temporary stacked typecheck worktree remains on disk after cleanup: ${normalizedWorktree}`
    );
  }
}

if (!baseSha || !/^[0-9a-f]{40}$/u.test(baseSha)) {
  throw new Error(
    "A full 40-character --base-sha from the pull request event is required."
  );
}

if (!existsSync(resolve(cwd, "node_modules"))) {
  throw new Error(
    "Current workspace node_modules is required for stacked typecheck comparison."
  );
}

assertSuccessful("git", ["cat-file", "-e", `${baseSha}^{commit}`]);
assertSuccessful("git", ["merge-base", "--is-ancestor", baseSha, "HEAD"]);

const dependencyDiff = run("git", [
  "diff",
  "--quiet",
  baseSha,
  "--",
  "package.json",
  "pnpm-lock.yaml",
]);
if (dependencyDiff.status === 1) {
  throw new Error(
    "Stacked typecheck comparison refuses to reuse dependencies when package.json or pnpm-lock.yaml differ from the declared base."
  );
}
if (dependencyDiff.status !== 0) {
  throw new Error(
    "Unable to verify dependency equality against the declared base."
  );
}

const worktree = await mkdtemp(resolve(tmpdir(), "kinga-stacked-typecheck-"));
let primaryError;
try {
  assertSuccessful("git", ["worktree", "add", "--detach", worktree, baseSha]);

  const baseNodeModules = resolve(worktree, "node_modules");
  if (
    existsSync(baseNodeModules) ||
    lstatSync(baseNodeModules, { throwIfNoEntry: false })
  ) {
    throw new Error(
      "Temporary base worktree unexpectedly contains node_modules."
    );
  }
  symlinkSync(resolve(cwd, "node_modules"), baseNodeModules, "junction");

  assertSuccessful(
    process.execPath,
    [comparatorPath, "--cwd", worktree, "--write-baseline"],
    {
      env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
    }
  );

  const baseBaseline = resolve(worktree, "ci/typecheck-baseline.json");
  if (!existsSync(baseBaseline)) {
    throw new Error("Base typecheck baseline was not produced.");
  }

  assertSuccessful(process.execPath, [
    comparatorPath,
    "--cwd",
    cwd,
    "--baseline-path",
    baseBaseline,
  ]);

  console.log(`Stacked TypeScript comparison passed against base ${baseSha}.`);
} catch (error) {
  primaryError = error;
}

let cleanupError;
try {
  cleanupWorktree(worktree);
} catch (error) {
  cleanupError = error;
}

if (primaryError && cleanupError) {
  throw new AggregateError(
    [primaryError, cleanupError],
    "Stacked TypeScript comparison and disposable worktree cleanup both failed."
  );
}
if (primaryError) throw primaryError;
if (cleanupError) throw cleanupError;
