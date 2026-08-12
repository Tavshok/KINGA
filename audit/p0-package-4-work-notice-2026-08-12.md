# P0 Package 4 Work Notice — Platform-Super-Admin Access & Canonical Administration Authorization

**Author:** Tavonga Shoko, Lead Engineer  
**Status:** Proposed work only — implementation requires explicit approval  
**Source evidence:** `AUD-008`, `AUD-009`, `AUD-013`, and `AUD-023` in the full-platform functional audit

## Purpose

This package corrects the contradiction between the required platform-super-admin testing capability and route/server authorization paths that only recognise `admin`. It introduces a single, explicit administrative access rule and a bounded super-admin testing exception. It does not turn ordinary users into administrators or weaken tenant/object authorization.

> Platform-super-admin access must be explicit, auditable, and consistent. It may broaden the ability to test authorised portal shells and administrative tools, but it must not bypass claim, report, document, or tenant-object security controls.

## Requested scope

| Workstream | Exact remediation boundary | Required result |
|---|---|---|
| **P4-A — Server rule consolidation** | Replace production direct `role === 'admin'` and `role !== 'admin'` administrative decisions with the canonical `isAdminRole()` policy or an explicit role predicate where the distinction is intentional. | Server-side administrative authority evaluates `admin` and `platform_super_admin` consistently. |
| **P4-B — Route/domain correction** | Update `ProtectedRoute` and `App.tsx` guards so platform-super-admin can enter the client claim-detail, professional portal shells, and intended administrative testing routes. | The owner can test every intended portal entry path without a loop or false denial. |
| **P4-C — Bounded exception policy** | Preserve domain, tenant, and object checks beneath route access. Cross-tenant actions retain the explicit tenant-selection/audit contract from Package 1. | No ordinary-role escalation and no silent cross-tenant object disclosure. |
| **P4-D — Role matrix** | Establish an explicit route-to-role testing matrix for client detail, insurer sub-role selection, agency, fleet, engineer, marketplace, and administrative routes. | Each intended path documents allow, deny, or explicit unavailable behavior. |
| **P4-E — Regression proof** | Add server and client route tests for ordinary-role denial, super-admin portal entry, tenant-bound object denial, role selection, and no-redirect-loop behavior. | Same-tenant functional access passes; foreign object IDs remain denied; expected unauthorised roles remain denied. |

## Explicitly out of scope

This package will not alter insurer sub-role business permissions, claim settlement/approval authority, tenant scope rules, reporting access ownership, pricing, user provisioning, external authentication, WhatsApp integration, or commercial role design. It corrects the platform-super-admin testing and canonical administrative authorization implementation only.

## Non-negotiable invariants

| ID | Invariant |
|---|---|
| ADM-01 | `isAdminRole()` is the canonical server-side administrative decision helper unless an explicit documented distinction is required. |
| ADM-02 | `platform_super_admin` may access intended portal and administrative testing entries; it does not automatically own a foreign tenant object. |
| ADM-03 | A platform-super-admin cross-tenant operation requires the Package 1 explicit selection and audit mechanism where the underlying procedure supports it. |
| ADM-04 | Ordinary non-admin users cannot gain administrative/portal access through the new route or middleware rules. |
| ADM-05 | Every tested portal route has a deterministic allow/deny/unavailable result rather than a redirect loop, blank shell, or opaque access error. |

## Required acceptance matrix

| Scenario | Expected result |
|---|---|
| Platform-super-admin opens client claim detail | Route admission succeeds; claim-object access remains tenant/object-authorised. |
| Platform-super-admin opens each intended professional and administrative portal shell | Route admission succeeds without redirect loop. |
| Ordinary insurer/client/agency/fleet user opens an unrelated privileged route | Denied or redirected to a role-appropriate state. |
| Platform-super-admin supplies a foreign claim/report/document without explicit supported scope | Denied; no sensitive data disclosed. |
| Platform-super-admin uses a supported cross-tenant procedure with explicit selection | Permitted and audited. |
| Server source scan | Direct admin comparisons are eliminated from the approved scope or documented as deliberate non-administrative distinctions. |
| Builds and focused tests | Server bundle, Vite build, and role/route test matrix pass. |

## Portal route matrix

| Portal or route family | Platform-super-admin | Platform admin | Insurer / insurer sub-role | Client / claimant | Agency | Fleet | Engineer | Deterministic state |
|---|---|---|---|---|---|---|---|---|
| `/claims/:id` client claim detail shell | **ALLOW** | Allow where existing route policy permits | Deny unless separately routed | Allow own authorised claim | Deny | Deny | Deny | Route admission does not imply object access. |
| `/client/*` | **ALLOW** | Existing customer-domain policy | Existing customer-domain policy | Allow | Allow customer shell only | Allow customer shell only | Allow customer shell only | Underlying claim/document API remains tenant/object constrained. |
| `/insurer-portal` selection | **ALLOW** | Allow | Allow | Deny | Deny | Deny | Deny | Insurer role-selection shell; sub-role route guard remains deliberate. |
| `/insurer-portal/*` sub-role shell | **ALLOW** through visible override | Existing admin override | Allow only matching insurer sub-role | Deny | Deny | Deny | Deny | Shell may load; procedure/workflow permissions remain authoritative. |
| `/agency*` | **ALLOW** | Allow | Deny | Deny | Allow | Deny | Deny | Tenant/client/RFQ controls remain authoritative. |
| `/fleet*` | **ALLOW** | Allow | Deny | Deny | Deny | Allow matching fleet role | Deny | Fleet object/driver assignment checks remain authoritative. |
| `/engineer*` | **ALLOW** | Allow | Deny | Deny | Deny | Deny | Allow | Inspection/project object access remains authoritative. |
| `/platform/*` | **ALLOW** | Deny | Deny | Deny | Deny | Deny | Deny | Platform shell is platform-super-admin only. |
| `/admin/*` intended testing surfaces | **ALLOW** | Allow | Only routes expressly retaining insurer entry | Deny | Deny | Deny | Deny | Backend administration/object checks remain authoritative. |
| Unauthorised or unknown route | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | **DENY / UNAVAILABLE** | One deterministic unauthorised or not-found state; no loop. |

## Release decision

The package is complete only when platform-super-admin route entry, bounded object protection, and ordinary-role denial are demonstrated through deterministic tests and an authenticated browser acceptance session. A source refactor alone is not sufficient.
