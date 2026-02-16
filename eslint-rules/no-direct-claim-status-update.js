/**
 * ESLint Rule: no-direct-claim-status-update
 * 
 * Blocks direct updates to claim.status field outside WorkflowEngine.
 * All workflow state changes must go through WorkflowEngine.transition().
 * 
 * Approved bypass patterns:
 * - Files in server/workflow/ directory (workflow engine internals)
 * - Test files (*.test.ts, test-helpers/)
 * - Migration scripts (server/migrations/)
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct claim status updates outside WorkflowEngine",
      category: "Governance",
      recommended: true,
    },
    messages: {
      directStatusUpdate: "Direct claim status update detected. Use WorkflowEngine.transition() instead.",
      directWorkflowStateUpdate: "Direct workflowState update detected. Use WorkflowEngine.transition() instead.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    
    // Allow in workflow engine internals
    if (filename.includes("/server/workflow/")) {
      return {};
    }
    
    // Allow in test files
    if (filename.includes(".test.ts") || filename.includes("/test-helpers/")) {
      return {};
    }
    
    // Allow in migration scripts
    if (filename.includes("/server/migrations/")) {
      return {};
    }

    return {
      // Detect: db.update(claims).set({ status: ... })
      CallExpression(node) {
        // Check for .set() method calls
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "set" &&
          node.arguments.length > 0
        ) {
          const setArg = node.arguments[0];
          
          // Check if it's an object with status or workflowState property
          if (setArg.type === "ObjectExpression") {
            for (const prop of setArg.properties) {
              if (
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                (prop.key.name === "status" || prop.key.name === "workflowState")
              ) {
                // Check if this is updating claims table
                const sourceCode = context.getSourceCode();
                const fullText = sourceCode.getText(node);
                
                // Look for patterns like: db.update(claims).set(...)
                if (fullText.includes("claims") || fullText.includes("claim")) {
                  context.report({
                    node: prop,
                    messageId: prop.key.name === "status" ? "directStatusUpdate" : "directWorkflowStateUpdate",
                  });
                }
              }
            }
          }
        }
      },
    };
  },
};
