#!/bin/bash
#
# Governance Compliance Check Script
# 
# Runs ESLint with custom governance rules and fails build if violations detected.
# This script is designed to run in CI/CD pipelines to enforce governance at build time.
#
# Exit codes:
#   0 - No violations detected
#   1 - Governance violations found
#   2 - Script execution error
#

set -e

echo "========================================="
echo "KINGA Governance Compliance Check"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if ESLint is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm not found${NC}"
    exit 2
fi

echo "Running governance enforcement checks..."
echo ""

# Run ESLint with governance rules
echo "1. Checking for direct claim status updates..."
if pnpm eslint --no-eslintrc --config .eslintrc.json --rule 'local-rules/no-direct-claim-status-update: error' 'server/**/*.ts' 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ Direct claim status updates detected${NC}"
    CLAIM_STATUS_VIOLATIONS=1
else
    echo -e "${GREEN}✓ No direct claim status updates${NC}"
    CLAIM_STATUS_VIOLATIONS=0
fi

echo ""
echo "2. Checking for direct role updates..."
if pnpm eslint --no-eslintrc --config .eslintrc.json --rule 'local-rules/no-direct-role-update: error' 'server/**/*.ts' 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ Direct role updates detected${NC}"
    ROLE_VIOLATIONS=1
else
    echo -e "${GREEN}✓ No direct role updates${NC}"
    ROLE_VIOLATIONS=0
fi

echo ""
echo "3. Checking for missing tenant filters..."
if pnpm eslint --no-eslintrc --config .eslintrc.json --rule 'local-rules/require-tenant-filter: error' 'server/**/*.ts' 2>&1 | grep -q "error"; then
    echo -e "${RED}✗ Missing tenant filters detected${NC}"
    TENANT_VIOLATIONS=1
else
    echo -e "${GREEN}✓ All queries have tenant filters${NC}"
    TENANT_VIOLATIONS=0
fi

echo ""
echo "========================================="

# Calculate total violations
TOTAL_VIOLATIONS=$((CLAIM_STATUS_VIOLATIONS + ROLE_VIOLATIONS + TENANT_VIOLATIONS))

if [ $TOTAL_VIOLATIONS -gt 0 ]; then
    echo -e "${RED}FAILED: $TOTAL_VIOLATIONS governance violation(s) detected${NC}"
    echo ""
    echo "Run 'pnpm lint:governance' for detailed violation report"
    echo ""
    exit 1
else
    echo -e "${GREEN}PASSED: No governance violations detected${NC}"
    echo ""
    exit 0
fi
