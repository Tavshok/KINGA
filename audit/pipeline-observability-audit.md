# KINGA Pipeline Observability Audit

**Author:** Tavonga Shoko, Lead Engineer  
**Audit date:** 11 August 2026

## Finding

The previously listed need for a separate `pipeline_execution_logs` table is already met by the active **`pipeline_runs`** and **`pipeline_jobs`** telemetry model. Creating a duplicate execution-log table would fragment operational truth and make production diagnosis harder.

| Requirement | Implemented control | Evidence |
|---|---|---|
| Pipeline execution record | `pipeline_runs` | `recordRunStart()` and `recordRunComplete()` in `server/db-pipeline.ts` |
| Per-stage status and timing | `pipeline_jobs` | `recordStageStart()` and `recordStageComplete()` |
| Timeout, degraded-mode, and failure evidence | `isTimeout`, `status`, `errorMessage`, timing fields | Stage completion payload and persisted row fields |
| Operational health read model | Safe read helpers | `getRunStages`, `getLatestRunForClaim`, `getRecentRuns`, `getStageHealthStats`, `getPipelineOverallStats` |
| Pipeline integration | Orchestrator callbacks | `server/db.ts` wires `onStageStart` and `onStageComplete` to the persistence helpers |

## Live Data Verification

The production database query on 11 August 2026 returned **191 pipeline run records** and **1,385 pipeline stage records**. The stage record set includes **132 degraded stages**, proving that degraded execution is captured rather than lost. No failed runs were present in the returned aggregate at the time of inspection.

## Conclusion

`pipeline_runs` and `pipeline_jobs` are the canonical observability record. Future work should extend their dashboards or alerts rather than introduce a parallel execution-log store.

## Approved model decision and implementation verification

**Decision:** retain `pipeline_runs` and `pipeline_jobs` as the sole execution-observability model. A `pipeline_execution_logs` table is not authorised because it would duplicate lifecycle truth and weaken production diagnosis.

The canonical run record carries run, claim, tenant, trigger, rerun, and aggregate lifecycle state. The canonical stage record carries the same run/claim/tenant linkage, ordered stage identity, status, degraded and timeout state, token/model metadata, assumptions, recovery actions, and bounded error evidence. These writes remain fire-and-forget: an observability failure never blocks claim assessment or changes a claim, policy, payment, settlement, or customer outcome.
