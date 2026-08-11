# KINGA Current-State Register

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 11 August 2026  
**Purpose:** Make the work since the portal audit visible, reviewable, and controllable before any further feature development.

> **Control decision:** No new feature work should begin until this register has been reviewed and the next batch has been explicitly approved. The only publishable baseline is the latest saved checkpoint listed below. The uncheckpointed re-run work is deliberately excluded from that baseline.

## 1. Publishable Baseline

The latest saved checkpoint is **`c59fb4cc`**. It includes every saved item in this register. It does **not** include the currently uncheckpointed claim re-run changes described in Section 4.

| Status | Meaning |
|---|---|
| **Keep — live test required** | Code, focused tests, and production builds passed; a user role must still perform the real published workflow. |
| **Keep — static verified** | The correction is supported by source audit, focused tests, and production builds, but browser/session testing has not been possible in the development preview. |
| **Hold — not publishable** | Work remains uncheckpointed and must not be published unless explicitly approved. |

## 2. Completed, Saved Work Since the Portal Audit

| Area | What changed | Latest checkpoint | Verification | Recommended decision |
|---|---|---:|---|---|
| **Portal stability** | Added static guards for missing React hook imports and invalid lazy page exports. Corrected missing imports in `Home.tsx` and `PortalSelection.tsx`, both capable of breaking the landing path. | `7d337481` | Focused tests and production builds passed. The original browser React #130 route still needs a real published retest. | **Keep — live test required** |
| **Agency Portal** | Repositioned the workspace around agency-managed clients and insurer dispatch. Agency staff can select a client, record the service request, choose insurer recipients, and dispatch quote requests. Legacy Agency valuation navigation redirects to My Portal. | `378779a1`, `113bb2db` | Focused workflow tests and production builds passed. Policy, commission, and renewal outcomes need a real agency-user test. | **Keep — live test required** |
| **Panel Beater Portal** | Preserved the VAT-capable direct quote builder, repaired the quote queue to show both invitations and allocated repairs, normalised historical IDs, and exposed profile-linking guidance instead of a misleading empty queue. | `f760e488`, `f3cb3d44` | Focused tests and production builds passed. Requires an allocated repairer account test. | **Keep — live test required** |
| **KINGA Engineers** | Repaired inspection route mismatches, made dashboard inspection creation open the real register/dialog flow, and added visible query error states. | `98acf08a` | Focused tests and production builds passed. Requires an engineer-user test. | **Keep — live test required** |
| **Fleet drivers** | Restored `/fleet/driver` as a dedicated driver workspace. Added manager-led driver onboarding and an assignment-scoped driver worklist. | `b1b7b7c6` | Focused tests and production builds passed. Requires a manager and Fleet Driver test. | **Keep — live test required** |
| **Fleet intelligence** | Added live manager cost, vehicle, driver, and risk signals; standard and custom period controls; browser print-to-PDF export; and secure driver attribution for claims submitted by active assigned Fleet Drivers. | `86a5efd8`, `4e135d21`, `f0dbdb37`, `809c9f24` | Focused tests, database migration verification, and production builds passed. Company claims submitted by managers without driver attribution remain a documented future gap. | **Keep — live test required** |
| **Insurer sub-roles** | Unassigned insurer users are no longer allowed to enter every workspace. Assigned insurer users route directly to the appropriate workspace; super-admin testing access remains. | `54aa3d22` | Focused tests and production builds passed. Requires one test per insurer sub-role. | **Keep — live test required** |
| **My Portal insurance** | Moved client insurance quoting out of the Agency path. Quote and policy records are client-scoped; quote detail and payment-proof actions enforce ownership. | `01672aa6`, `13f5274e` | Focused authorization tests and production builds passed. Requires a client quote and payment-proof test. | **Keep — live test required** |
| **Release safeguards** | Added `pnpm audit:portal`, `pnpm test:portal`, missing-import/lazy-route audits, and a tracked pre-commit conflict-marker guard. | `0152839e`, `cfaffa4a` | Static audits, focused tests, and production builds passed. | **Keep — static verified** |
| **Acceptance materials** | Added the portal conformance audit and a role-by-role live verification matrix with pass/fail evidence requirements. | `9a681ccc`, `8d006b1c` | Documentation completed. | **Keep — use for live testing** |
| **Quote line items** | Added regression coverage from quote-line-item persistence through Stage 9 and reports; added a conservative, claim-scoped historical recovery script that is dry-run by default. | `c59fb4cc` | 24 focused tests and production builds passed. Dry-run made no database changes. Historical recovery must be reviewed claim by claim. | **Keep — controlled use only** |

## 3. What Has Not Been Proven Live

The following has **not** been proven merely because a build or source test passed:

1. The original React #130 page no longer fails in the user’s actual published browser session.
2. Each professional role can enter its portal with its real account, tenant, and assigned data.
3. An Agency user can dispatch a quote and see insurer responses.
4. A Panel Beater with a linked business profile receives an allocated job, submits a VAT quote, uploads evidence, and completes repair.
5. A Fleet Manager assigns a Fleet Driver; the Driver sees only their allocation and submits a company claim; the Manager sees resulting claim cost and risk.
6. A client submits a direct insurance quote, sees only their own quote/policy, and submits payment proof.
7. CL, CI, and FR reports render on the published site for an assessed claim.

These are not hidden defects. They are the explicit **live acceptance gate** that was not enforced early enough.

## 4. Work Currently on Hold — Not Included in `c59fb4cc`

The following code is still local and **must not be published** without your approval:

| Held work | Reason it was started | Current status | Recommended decision |
|---|---|---|---|
| Claim re-run workflow transitions | To permit controlled re-analysis from assessment-complete, internal review, technical approval, and financial decision states. | Source changes and focused tests passed locally. The change adds explicit workflow permissions for a claims processor. | **Hold for review.** Approve only after deciding that re-runs should be a claims-processor function at all approval stages. |
| Logout regression expectation | A stale test expected `SameSite=None`; runtime code uses the established `SameSite=Lax` session policy. | Test expectation corrected locally. | **Hold with re-run change** because it is uncheckpointed. |

## 5. Recommended Next Step — One Controlled Batch

Publish **`c59fb4cc`** as the stable baseline. Then run only the following five live checks before any additional engineering:

| Priority | Role | Live check | Pass condition |
|---:|---|---|---|
| 1 | Platform Super Admin | Open the landing page and an assessed claim; open CL, CI, and FR. | No React crash; each report renders. |
| 2 | Agency | Create a client service request and select insurer recipients. | Request appears in the agency worklist and is dispatched. |
| 3 | Panel Beater | Open an allocated quote request and submit a VAT quote. | Quote appears in history with totals and VAT. |
| 4 | Fleet Manager and Driver | Assign a driver; log in as that driver; submit or view a company claim. | Driver sees only assigned work; manager sees the relevant claim. |
| 5 | Client | Request a direct insurance quote from My Portal. | Client sees only their own quote/policy records. |

For any failure, capture only: **URL, account role, selected claim/request ID, action clicked, displayed error, and screenshot**. That becomes one approved defect batch rather than another broad cycle of changes.
