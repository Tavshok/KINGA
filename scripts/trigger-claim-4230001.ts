/**
 * One-off script: trigger AI assessment pipeline for claim 4230001 (Natpharm)
 * Run with: cd /home/ubuntu/kinga-replit && ./node_modules/.bin/tsx scripts/trigger-claim-4230001.ts
 */
import { triggerAiAssessment } from "../server/db";

console.log("[Trigger] Starting AI assessment for claim 4230001 (Natpharm)...");
console.log("[Trigger] Time:", new Date().toISOString());

triggerAiAssessment(4230001)
  .then(() => {
    console.log("[Trigger] Pipeline completed successfully at", new Date().toISOString());
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Trigger] Pipeline failed:", err.message);
    process.exit(1);
  });
