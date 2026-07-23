import { triggerAiAssessment } from "./server/db";

async function main() {
  console.log("Triggering pipeline re-run for claim 8880001...");
  try {
    await triggerAiAssessment(8880001);
    console.log("Pipeline run completed successfully");
  } catch (e: any) {
    console.error("Pipeline error:", e.message);
  }
  process.exit(0);
}

main();
