# KINGA Known Limitations and Technical Debt

> This is an evidence register, not a claim that every item is an active production defect. Severity identifies the review priority if the listed condition is encountered.

| Priority | Evidence-backed limitation or risk | Evidence / impact | Required next action |
|---|---|---|---|
| P0 review gate | Tenant/object authority regressions are high impact. | Historical P0 suites exist for inspections, notifications, quotes/reports and tenant workflows. | Any touched path must retain early tenant/object checks and denial/no-side-effect tests. |
| P0 review gate | Hard-deleted identity must remain fail-closed. | Authentication/user resync has dedicated historical remediation context. | Do not reintroduce automatic reprovisioning on missing user rows. |
| P1 | Live database/source-schema drift requires controlled reconciliation. | `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md` and remediation plan; source schema alone is not live truth. | Reconcile in a separately approved, non-production-first schema project. |
| P1 | Full suite can be variable/environment-sensitive. | Baseline comparisons and fixture-teardown work identify instability/cleanup concerns. | Compare exact failure IDs to fresh main; continue teardown and test-worker reliability work. |
| P1 | Vite chunk rendering can exceed sandbox memory. | Recent validation transformed modules but did not complete chunk rendering under the sandbox ceiling. | Use CI or larger environment for authoritative production build where local run is incomplete. |
| P1 | Reports are contract-sensitive. | Canonical resolver/report-model migration and parity tests were needed to prevent independent derivation. | Treat direct raw report reads and unsourced dashboard metrics as review blockers. |
| P2 | Large modules and ongoing splitting risk. | Handover plan identifies file-size boundaries; Wave 1 began compatibility-barrel splits. | Preserve export/import baselines and defer higher-risk splits until verification conditions exist. |
| P2 | Deployment topology is incompletely verifiable from source. | Docker/CI/Kafka/MLflow/monitoring artefacts exist, but deployment activation is not proven. | Inventory the actual deployed environment, owners, alerts, rollback and backup procedures. |
| P2 | WhatsApp and some external-provider capabilities are not proven active. | Dependency/config references do not prove configured production workflows. | Verify provider adapter, credential handling, webhook, authority and tests before advertising support. |
| P2 | Staging separation is not established by repository evidence. | Local/deployment docs do not independently prove a governed staging/production split. | Establish named non-production environment and safe test tenant process. |
| P3 | Existing documentation may conflict with code. | Many historical design/audit documents exist. | Use this package and implementation traces; log conflicts in `KINGA_DOCUMENTATION_AUDIT.md`. |

## Do not assume

Do not assume that package dependencies are active integrations, that every page is fully wired, that all tables in the source schema exist live, that a report metric is a payment/settlement fact, that a document implies evidence quality, or that a completed-looking dashboard reflects non-empty real data. Verify the actual feature path.
