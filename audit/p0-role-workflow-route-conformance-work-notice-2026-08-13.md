# P0 Role-to-Workflow and Portal Route-Conformance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Controlled work notice — no implementation approved yet

## Purpose

This notice proposes a bounded P0 conformance batch for active portal shells. It will align each visible portal tab, action, route, procedure, data source, and empty/error state with its intended role. The aim is to remove cross-role feature leakage, route loops, and orphaned states without changing business outcomes.

## In scope

| Area | Controlled work |
|---|---|
| Portal inventory | Record active client, insurer, assessor, panel-beater, agency, fleet, engineer, and platform administration routes, tabs, actions, and data dependencies. |
| Role-to-workflow mapping | Assign each feature to one intended role and workflow; identify disabled, unavailable, forbidden, and empty states explicitly. |
| Route conformance | Ensure visible navigation resolves to a permitted role shell or a clear, stable recovery state; preserve landing-page access and no-loop safeguards. |
| Data and mutation boundaries | Verify every displayed data source and action is role-authorised and tenant/object scoped; remove only unintended cross-role exposure. |
| Regression coverage | Add deterministic route, role, tab, procedure, and empty-state assertions. |

## Explicitly excluded

This batch must not create or amend a claim, quote, policy, premium, valuation amount, repair cost, settlement, payment, commission, fleet instruction, or customer record. It will not alter engine calculations, models, permissions beyond role-shell conformance, or external integrations.

## Required invariants

1. **Landing page remains public.** Portal entry must be deliberate and role-correct.
2. **Platform-super-admin shell access does not grant foreign tenant or object authority.**
3. **Agency is an agent/broker service workspace, not a client self-service portal.**
4. **Restricted agency-assisted claimant identities remain claim-workflow-only.**
5. **A visible action must be permitted, explicitly unavailable, or absent.** It must never leave an orphaned view or redirect loop.
6. **No client, professional, or administration portal may silently present another role's data or action.**

## Acceptance matrix

| Acceptance case | Required result |
|---|---|
| Intended role opens its portal shell | Correct workspace, navigation, and scoped data state are rendered. |
| Ordinary role opens another role's route | Stable forbidden/unavailable recovery; no loop or data leak. |
| Visible tab/action has no valid workflow | Explicit role-appropriate unavailable state or removal from navigation. |
| Platform-super-admin opens a portal shell | Test shell is available; tenant/object procedures remain separately scoped. |
| API/data failure | Role-appropriate error state, with no stale or cross-role information. |
| Route back/forward or reload | Deterministic route decision; no render-phase navigation loop. |

## Completion evidence

Completion requires a route-and-workflow inventory, source-level regression coverage, bundled server and Vite production builds, and an updated user-executable authenticated route checklist. Authenticated browser testing remains an external gate where role accounts are unavailable to the sandbox.

## Approval request

Approval authorises only the conformance inventory, role/route wiring corrections, deterministic regression coverage, and checklist update described above.
