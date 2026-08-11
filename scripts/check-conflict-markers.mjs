import { execFileSync } from "node:child_process";

const CONFLICT_MARKER = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/m;

export function findConflictMarkers(content) {
  return String(content ?? "")
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => CONFLICT_MARKER.test(line));
}

function stagedFiles() {
  const output = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function stagedContent(filePath) {
  return execFileSync("git", ["show", `:${filePath}`], { encoding: "utf8" });
}

export function run({ files = stagedFiles(), contentForFile = stagedContent } = {}) {
  const failures = [];
  for (const filePath of files) {
    try {
      const markers = findConflictMarkers(contentForFile(filePath));
      if (markers.length > 0) failures.push({ filePath, markers });
    } catch (error) {
      console.error(`Unable to inspect staged file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
  }

  if (failures.length === 0) {
    console.log("Conflict-marker check passed.");
    return 0;
  }

  console.error("Commit blocked: unresolved Git conflict markers were found in staged files.");
  for (const { filePath, markers } of failures) {
    for (const marker of markers) console.error(`  ${filePath}:${marker.lineNumber}  ${marker.line}`);
  }
  console.error("Resolve the conflict markers before committing.");
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run();
}
