# KINGA CI/CD Automation Scripts

This directory contains all automation scripts referenced in the CI/CD Governance Policy (KINGA-CICD-2026-006).

## Directory Structure

```
scripts/
├── gates/              # Stability gate validation scripts (G1-G7)
├── checkpoint/         # Checkpoint creation and management
├── deploy/             # Deployment scripts (staging, production)
├── rollback/           # Rollback scripts (code, database, configuration)
├── health-check/       # Health check validation scripts
├── performance/        # Performance testing and profiling
├── ai-validation/      # AI model validation and drift detection
├── db-validation/      # Database integrity checks
├── monitoring/         # Monitoring setup and validation
├── notification/       # Slack, PagerDuty, email notifications
├── escalation/         # Failure escalation automation
├── validation/         # Configuration and documentation validation
└── reporting/          # Deployment and incident reporting
```

## Usage

### Running All Stability Gates

```bash
./scripts/gates/run-all-gates.sh
```

### Running Individual Gates

```bash
./scripts/gates/g1-regression.sh      # G1: Regression Testing
./scripts/gates/g2-performance.sh     # G2: Performance Baseline
./scripts/gates/g3-ai-model.sh        # G3: AI Model Validation
./scripts/gates/g4-database.sh        # G4: Database Integrity
./scripts/gates/g5-rollback.sh        # G5: Rollback Preparation
./scripts/gates/g6-deployment.sh      # G6: Deployment Safety
./scripts/gates/g7-monitoring.sh      # G7: Monitoring Activation
```

### Creating Checkpoints

```bash
./scripts/checkpoint/create-checkpoint.sh "checkpoint-description"
```

### Deploying to Staging

```bash
./scripts/deploy/deploy-staging.sh
```

### Deploying to Production

```bash
./scripts/deploy/deploy-production.sh
```

### Rolling Back Production

```bash
./scripts/rollback/rollback-production.sh
```

### Health Checks

```bash
./scripts/health-check/check-staging.sh
./scripts/health-check/check-production.sh
```

## Implementation Status

| Script Category | Status | Notes |
|---|---|---|
| Stability Gates (G1-G7) | ✅ Documented | Implementation in progress (Sprint 1) |
| Checkpoint Management | ⏳ Planned | Sprint 1 |
| Deployment Scripts | ⏳ Planned | Sprint 2 |
| Rollback Scripts | ⏳ Planned | Sprint 1 |
| Health Checks | ⏳ Planned | Sprint 1 |
| Performance Testing | ⏳ Planned | Sprint 2 |
| AI Validation | ⏳ Planned | Sprint 2 |
| Database Validation | ⏳ Planned | Sprint 1 |
| Monitoring Setup | ✅ Docker Compose ready | Sprint 1 |
| Notification System | ⏳ Planned | Sprint 2 |
| Escalation Automation | ⏳ Planned | Sprint 2 |

## Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose (for monitoring stack)
- k6 (for load testing)
- jq (for JSON parsing)
- bc (for floating-point calculations)

## Environment Variables

The following environment variables must be set:

```bash
# Slack Integration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# PagerDuty Integration
PAGERDUTY_API_KEY=...

# Monitoring
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3001
LOKI_URL=http://localhost:3100
JAEGER_URL=http://localhost:16686

# Deployment
PRODUCTION_DEPLOY_KEY=...
STAGING_DEPLOY_KEY=...
```

## Contributing

When adding new scripts:

1. Place scripts in the appropriate subdirectory
2. Make scripts executable: `chmod +x script-name.sh`
3. Add error handling: `set -e` at the top
4. Log all output to `logs/` directory
5. Return exit code 0 for success, non-zero for failure
6. Update this README with usage instructions

## References

- [CI/CD Governance Policy](../docs/CICD-GOVERNANCE-POLICY.md)
- [Engineering Sprint Plan](../docs/ENGINEERING-SPRINT-PLAN.md)
- [Continuous Stability Gates](../docs/CONTINUOUS-STABILITY-GATES.md)
