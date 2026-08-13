# P0 Package 4 — Platform Authorization and Portal Route Conformance Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Controlled scope only — no implementation authority until explicit approval

## 1. Purpose

This notice defines the next P0 corrective batch after the approved agency architecture and valuation-boundary work. It addresses two related risks: inconsistent server-side treatment of administrative authority, and portal routes that may admit, redirect, deny, or loop inconsistently for an authenticated `platform_super_admin` versus ordinary users.

The objective is to make authorization deterministic and explainable without widening access to tenant-bound claims, documents, reports, evidence, payments, settlements, policies, or workflow decisions.

## 2. Controlled Scope

| Control area | Proposed work | Required outcome |
|---|---|---|
| Administrative guards | Inventory direct `role === "admin"` checks in active server procedures; replace genuine administrative checks with `isAdminRole()` or document intentional business-role checks. | A maintainable, explicit role policy; no accidental loss of platform-super-admin testing access. |
| Portal-shell admission | Define a server/client route matrix for Landing, Client, Insurer, Assessor, Panel Beater, Agency, Fleet, Engineer, and Platform Admin surfaces. | Landing page remains public; authenticated users reach a deterministic authorized portal shell or a truthful unavailable/forbidden state. |
| Platform-super-admin testing | Permit platform-super-admin entry to portal shells for system testing only. | Shell admission does not imply cross-tenant object, evidence, financial, or workflow authority. |
| Redirect/no-loop behavior | Remove route redirects that return a permitted user to a generic hub, stale route, or repeated verification state. | One stable outcome per authenticated role-and-route combination. |
| Object-boundary preservation | Retain Package 1 and Package 2 tenant and object scope enforcement after route consolidation. | A super-admin portal shell cannot silently access foreign tenant data without an explicit, audited tenant selection. |

## 3. Explicit Exclusions

This batch must not:

- create, alter, approve, reject, price, issue, renew, cancel, or settle a policy;
- create a premium, repair cost, payment, commission, financial approval, or settlement record;
- modify customer claims, documents, quotations, assessments, reports, evidence, pipeline jobs, identities, or tenant data;
- change the previously approved agency-service request, valuation, pre-loss condition, or canonical intake boundaries;
- execute authenticated browser testing on the user's personal session without a separate user-executed checklist.

## 4. Acceptance Matrix

| Test | Required result |
|---|---|
| Public `/` | Always renders the KINGA landing page, whether authenticated or unauthenticated. |
| Ordinary user on a foreign professional route | Receives a stable forbidden or role-appropriate unavailable state; no redirect loop. |
| Platform super-admin on each portal shell | Can enter the shell for system testing, with a clear test-mode boundary where applicable. |
| Platform super-admin opening a tenant-bound object without scope | Denied or prompted for explicit audited tenant selection; never receives foreign data by route admission alone. |
| Valid tenant-scoped object access | Continues to work for the legitimate same-tenant role. |
| Direct `admin` check inventory | Every retained check has a documented reason or uses the shared helper. |
| Browser route matrix | User-executed authenticated checklist records success, unavailable, or denial for every portal route. |

## 5. Implementation Sequence

The batch will first create an authoritative direct-admin and portal-route inventory. It will then consolidate server guard semantics, make client route admission deterministic, and add no-loop and object-boundary regressions. The final step is an isolated test/build verification and a user-executable authenticated route checklist.

## 6. Definition of Done

The package is complete only when the server and client enforce the same role matrix, platform-super-admin shell admission is separate from object authority, ordinary users cannot enter another role's working surface, redirect loops are absent in deterministic regression coverage, and production builds pass. Browser-session acceptance remains an external user gate and must be reported separately rather than assumed.
