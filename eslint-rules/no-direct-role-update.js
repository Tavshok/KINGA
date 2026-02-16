/**
 * ESLint Rule: no-direct-role-update
 * 
 * Blocks direct updates to user.role field outside roleAssignmentService.
 * All role changes must go through assignUserRole() for audit trail logging.
 * 
 * Approved bypass patterns:
 * - Files in server/services/user-management.ts (role assignment service)
 * - Files in server/services/role-assignment-audit.ts (audit service internals)
 * - Test files (*.test.ts, test-helpers/)
 * - Migration scripts (server/migrations/)
 * - Initial user creation (INSERT operations are allowed)
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow direct role updates outside roleAssignmentService",
      category: "Governance",
      recommended: true,
    },
    messages: {
      directRoleUpdate: "Direct role update detected. Use assignUserRole() from user-management service instead.",
      directInsurerRoleUpdate: "Direct insurerRole update detected. Use assignUserRole() from user-management service instead.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    
    // Allow in role assignment service
    if (filename.includes("/server/services/user-management.ts")) {
      return {};
    }
    
    // Allow in audit service internals
    if (filename.includes("/server/services/role-assignment-audit.ts")) {
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
      // Detect: db.update(users).set({ role: ... })
      CallExpression(node) {
        // Check for .set() method calls
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "set" &&
          node.arguments.length > 0
        ) {
          const setArg = node.arguments[0];
          
          // Check if it's an object with role or insurerRole property
          if (setArg.type === "ObjectExpression") {
            for (const prop of setArg.properties) {
              if (
                prop.type === "Property" &&
                prop.key.type === "Identifier" &&
                (prop.key.name === "role" || prop.key.name === "insurerRole")
              ) {
                // Check if this is updating users table
                const sourceCode = context.getSourceCode();
                const fullText = sourceCode.getText(node);
                
                // Look for patterns like: db.update(users).set(...)
                // But allow db.insert(users).values({ role: ... })
                if (fullText.includes("update") && (fullText.includes("users") || fullText.includes("user"))) {
                  context.report({
                    node: prop,
                    messageId: prop.key.name === "role" ? "directRoleUpdate" : "directInsurerRoleUpdate",
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
