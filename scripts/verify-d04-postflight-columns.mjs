import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const [correctedWaveFourPath, ...liveCsvPaths] = process.argv.slice(2);
if (!correctedWaveFourPath || !liveCsvPaths.length) {
  console.error("Usage: node scripts/verify-d04-postflight-columns.mjs <corrected-wave-4.sql> <one-or-more-live-columns.csv>");
  process.exit(2);
}

const comparator = resolve("scripts/verify-d03-postflight-columns.mjs");
const result = spawnSync(process.execPath, [comparator, correctedWaveFourPath, ...liveCsvPaths], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
