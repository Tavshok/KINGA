/**
 * Targeted syntax check for the new pipeline files.
 * Uses esbuild (already installed) to do a fast bundle-check without full type resolution.
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';

const files = [
  'server/pipeline-v2/forwardDamageEstimation.ts',
  'server/pipeline-v2/damageClassificationEngine.ts',
];

let allOk = true;
for (const f of files) {
  const path = `/home/ubuntu/kinga-replit/${f}`;
  if (!existsSync(path)) {
    console.error(`MISSING: ${f}`);
    allOk = false;
    continue;
  }
  try {
    execSync(
      `npx esbuild "${path}" --bundle=false --platform=node --format=esm --log-level=error 2>&1`,
      { cwd: '/home/ubuntu/kinga-replit', stdio: 'pipe' }
    );
    console.log(`OK: ${f}`);
  } catch (e) {
    console.error(`ERROR: ${f}`);
    console.error(e.stdout?.toString() || e.message);
    allOk = false;
  }
}

process.exit(allOk ? 0 : 1);
