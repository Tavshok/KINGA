# KINGA Process / Protect / Prove Cost-Tier Gating Verification

**Date:** 20 August 2026  
**Scope:** Static executable-code and documentation review only. No database access, pricing change, access change, migration, or DDL.

## Conclusion

The **Process / Protect / Prove commercial tier model is documented but not implemented as an enforced subscription gate** in the current codebase.

The live system does implement **role-based report access** and a report catalogue that describes the Claims Intelligence Report as “Process-tier.” It does **not** resolve a tenant’s commercial plan, evaluate a trial/activation rule, require a forensic buy-up, enforce the 50-claim / 30-day activation gate, or restrict report/portfolio capability by Process, Protect, or Prove subscription.

> `server/routers/reporting.ts` explicitly states: “Tier/subscription system not yet implemented — all insurer roles have access to all claim-level reports. Access is role-based only.” [1]

## What Is Implemented

| Capability | Evidence | Status |
|---|---|---|
| Role-based report authorization | `canAccessReport()` checks `REPORT_ACCESS` against user role / insurer sub-role. | **Implemented** |
| Platform-super-admin report access | `isAdminRole()` allows unrestricted report access when no insurer sub-role is active. | **Implemented** |
| Claims Intelligence report routing | Catalogue registers `claim.intelligence` with a Process-tier description and dispatches it to `generateClaimsIntelligenceReport()`. | **Implemented as a report type, not as a subscription gate** |
| Forensic report routing | Catalogue registers `claim.forensic` and role rules limit it to designated insurer roles. | **Implemented as role authorization, not as commercial gating** |
| Forensic availability from assessment content | Report availability may consider persisted `has_forensic` / `has_physics` indicators. | **Content-readiness logic, not subscription entitlement** |
| “Upgrade” presentation | Claims Intelligence source/UI contains forensic-upgrade wording. | **Presentation/upsell copy only** |

## What Is Not Implemented

| Planned commercial control | Static evidence | Classification |
|---|---|---|
| Tenant subscription resolution for `Process`, `Protect`, or `Prove` | No executable references to these plan identifiers in server/client entitlement logic. | **Not implemented** |
| Per-tenant product configuration | No tenant plan-to-feature policy resolver found. | **Not implemented** |
| 50 test claims / 30 days before gates activate | No executable counter, trial-start state, or activation-date check found. | **Not implemented** |
| Process exclusion of forensic reports except paid buy-up | `claim.forensic` is role-gated; no buy-up flag or plan entitlement is evaluated in report authorization. | **Not implemented** |
| Protect / Prove capability separation | No code maps report keys, physics outputs, fraud explanation, portfolio analytics, or forensic evidence to a commercial plan. | **Not implemented** |
| $12 per-claim fee enforcement or current package prices | No billing/cost-recovery calculation or payment entitlement was found in the report access path. | **Not implemented** |
| Portfolio anti-downgrade gate | Portfolio reports have role access entries, but no plan-tier entitlement check. | **Not implemented** |

## Existing Subscription-Like Fields Are Not a KINGA Commercial Gate

The executable code contains `subscriptionTier` references for fleet account defaults and Tenant Monitoring display. The observed values and use sites are `free`, `professional`, and `enterprise`; they are not mapped to **Process / Protect / Prove**, and they are not consulted by the report authorization path.[2]

Accordingly, these fields must not be treated as a deployed implementation of the approved commercial model.

## Product Decision Boundary

The technical conclusion is unambiguous: commercial gating is absent. The correct remediation design is **not** determined by static analysis alone and must be approved before implementation because it changes product availability and potentially the price/entitlement of currently visible report capabilities.

The following product decisions are required before an implementation package can be drafted:

1. The authoritative tenant-level plan model: exact plan identifiers, effective dates, grandfathering, and whether fleet tiers are separate from insurer report tiers.
2. The trial gate: whether the 50-claim and 30-day conditions are **OR** or **AND**, the authoritative claim counter, and whether the trial is per tenant, insurer account, product, or policy.
3. The forensic buy-up: one-off per claim, subscription add-on, entitlement duration, and treatment of reports generated before an entitlement change.
4. The specific Protect and Prove feature matrices, including whether portfolio analytics are commercially gated or merely role-restricted.
5. The desired behavior for users who lose entitlement: locked visibility, preserved historical access, re-generation restrictions, export restrictions, and internal/admin exceptions.

No technical implementation, mock entitlement, default plan, financial rule, or payment behavior has been inferred in this review.

## References

[1] [`server/routers/reporting.ts`](../server/routers/reporting.ts)

[2] [`server/routers/fleet-accounts.ts`](../server/routers/fleet-accounts.ts) and [`client/src/pages/admin/TenantMonitoring.tsx`](../client/src/pages/admin/TenantMonitoring.tsx)

[3] [`docs/KINGA-CLAUDE-CODE-READINESS.md`, Section 8](../docs/KINGA-CLAUDE-CODE-READINESS.md)
