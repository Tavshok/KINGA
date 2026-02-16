/**
 * ESLint Rule: require-tenant-filter
 * 
 * Requires tenantId filtering in all database queries involving claims, users, or roles.
 * Enforces tenant isolation at the query level.
 * 
 * Approved bypass patterns:
 * - Admin-only operations explicitly documented with // eslint-disable-next-line
 * - System-level operations in server/_core/ directory
 * - Test files (*.test.ts, test-helpers/)
 * - Migration scripts (server/migrations/)
 * - Queries that use governance-safe wrappers (e.g., getClaimsByState)
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Require tenantId filter in database queries for multi-tenant tables",
      category: "Governance",
      recommended: true,
    },
    messages: {
      missingTenantFilter: "Query on {{table}} table missing tenantId filter. Add tenant isolation or use governance-safe wrapper.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();
    
    // Allow in system core
    if (filename.includes("/server/_core/")) {
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
    
    // Tables that require tenant filtering
    const tenantTables = ["claims", "users", "roleAssignmentAudit", "workflowAuditTrail"];

    return {
      // Detect: db.select().from(claims).where(...)
      CallExpression(node) {
        // Check for .from() method calls
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.name === "from" &&
          node.arguments.length > 0
        ) {
          const fromArg = node.arguments[0];
          
          // Check if it's a tenant table
          if (fromArg.type === "Identifier" && tenantTables.includes(fromArg.name)) {
            const tableName = fromArg.name;
            
            // Get the full query chain
            const sourceCode = context.getSourceCode();
            let currentNode = node.parent;
            let queryText = sourceCode.getText(node);
            
            // Walk up the AST to get the full query chain
            while (currentNode && currentNode.type === "MemberExpression") {
              queryText = sourceCode.getText(currentNode);
              currentNode = currentNode.parent;
            }
            
            // Check if tenantId filter is present
            const hasTenantFilter = 
              queryText.includes("tenantId") ||
              queryText.includes("tenant_id") ||
              // Allow if using governance-safe wrappers
              queryText.includes("getClaimsByState") ||
              queryText.includes("getClaimsByAssessor") ||
              queryText.includes("getUsersByTenant");
            
            if (!hasTenantFilter) {
              // Check if there's an eslint-disable comment
              const comments = sourceCode.getCommentsBefore(node);
              const hasDisableComment = comments.some(comment => 
                comment.value.includes("eslint-disable-next-line require-tenant-filter")
              );
              
              if (!hasDisableComment) {
                context.report({
                  node: fromArg,
                  messageId: "missingTenantFilter",
                  data: {
                    table: tableName,
                  },
                });
              }
            }
          }
        }
        
        // Also check .update() and .delete() operations
        if (
          node.callee.type === "MemberExpression" &&
          (node.callee.property.name === "update" || node.callee.property.name === "delete") &&
          node.arguments.length > 0
        ) {
          const tableArg = node.arguments[0];
          
          if (tableArg.type === "Identifier" && tenantTables.includes(tableArg.name)) {
            const tableName = tableArg.name;
            const sourceCode = context.getSourceCode();
            let currentNode = node.parent;
            let queryText = sourceCode.getText(node);
            
            // Walk up to get full query
            while (currentNode && currentNode.type === "MemberExpression") {
              queryText = sourceCode.getText(currentNode);
              currentNode = currentNode.parent;
            }
            
            const hasTenantFilter = 
              queryText.includes("tenantId") ||
              queryText.includes("tenant_id");
            
            if (!hasTenantFilter) {
              const comments = sourceCode.getCommentsBefore(node);
              const hasDisableComment = comments.some(comment => 
                comment.value.includes("eslint-disable-next-line require-tenant-filter")
              );
              
              if (!hasDisableComment) {
                context.report({
                  node: tableArg,
                  messageId: "missingTenantFilter",
                  data: {
                    table: tableName,
                  },
                });
              }
            }
          }
        }
      },
    };
  },
};
