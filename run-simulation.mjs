import { testWorkflowSimulation } from "./server/test-workflow.ts";

testWorkflowSimulation().then(report => {
  console.log(report);
}).catch(error => {
  console.error("Test failed:", error);
  process.exit(1);
});
