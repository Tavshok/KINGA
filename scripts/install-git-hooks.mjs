import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("KINGA Git hooks enabled from .githooks.");
} catch {
  console.log("Skipping Git hook installation: the current directory is not a Git worktree.");
}
