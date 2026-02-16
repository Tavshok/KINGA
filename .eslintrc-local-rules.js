/**
 * Local ESLint Rules Registration
 * 
 * Registers custom governance rules as a local plugin.
 */

const governanceRules = require("./eslint-rules/index.js");

module.exports = governanceRules.rules;
