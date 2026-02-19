// @ts-nocheck
import { router, protectedProcedure } from "../_core/trpc";
import { testWorkflowSimulation } from "../test-workflow";

export const simulationRouter = router({
  runFullWorkflow: protectedProcedure.query(async () => {
    try {
      const report = await testWorkflowSimulation();

      return {
        success: true,
        report,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        report: `# Workflow Simulation Failed\n\nError: ${error.message}`,
      };
    }
  }),
});
