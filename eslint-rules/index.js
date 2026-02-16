/**
 * Custom ESLint Plugin: Governance Enforcement
 * 
 * Loads custom rules for KINGA governance enforcement.
 */

module.exports = {
  rules: {
    "no-direct-claim-status-update": require("./no-direct-claim-status-update"),
    "no-direct-role-update": require("./no-direct-role-update"),
    "require-tenant-filter": require("./require-tenant-filter"),
  },
};
