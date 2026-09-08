# KINGA Deployment and Operations Manual

## 1. Verified repository artefacts

| Artefact | Evidence | What it proves | What it does not prove |
|---|---|---|---|
| Container build | `Dockerfile` | A container-oriented deployment artefact exists | The active production platform, revision or rollout policy |
| CI workflow | `.github/workflows/cicd-pipeline.yml` | GitHub Actions CI configuration exists | That every workflow has passed for the deployed revision |
| Monitoring artefacts | `deployment/monitoring/docker-compose.yml`, Sentry dependencies/core module | Monitoring-related configuration/code exists | Active production dashboards, alerts, retention or on-call response |
| Kafka/MLflow artefacts | `deployment/kafka/docker-compose.yml`, `deployment/mlflow/Dockerfile` | Supporting infrastructure artefacts exist | That Kafka/MLflow is provisioned or used by current production traffic |
| Production documents | `docs/deployment-guide.md`, `PRODUCTION_OPERATIONS_MANUAL.md`, `PRODUCTION_DEBUGGING_RUNBOOK.md` | Supporting operational material exists | That it overrides executable config or reflects current deployment |

## 2. Build and release checks

Use `pnpm check:conflicts`, `pnpm check`, focused tests, `pnpm test`, `pnpm check:server`, and `pnpm build` as appropriate. Compare tests/type errors with a fresh current-main baseline. The repository has previously encountered sandbox memory pressure during Vite chunk rendering; a run that transforms modules but does not exit successfully is incomplete, not a successful production build. CI or an adequately provisioned build environment must provide the authoritative result in that case.

## 3. Operational incident sequence

1. Identify the environment, revision, route/procedure, tenant impact and time window.
2. Preserve logs and identifiers without copying secrets or customer data into tickets.
3. Confirm whether the issue is authentication/tenant authority, data access, pipeline/provider, report output, UI rendering, or infrastructure.
4. Reproduce using a non-production, owned fixture if permitted.
5. Apply the smallest reviewed change; re-run targeted security/report/pipeline tests and compare the suite baseline.
6. Roll back through the approved platform/release process. Exact production rollback controls are **[NOT VERIFIED IN CODEBASE]**.

## 4. Environment and secrets

Environment variables are referenced through application configuration and `.env.example`; runtime credentials must be injected through the approved secret mechanism. Exact production/staging separation, cloud account/project, database account, backup schedule, log retention, alert thresholds, disaster-recovery targets and release approvers are **[NOT VERIFIED IN CODEBASE]**. Do not convert those unknowns into undocumented assumptions.
