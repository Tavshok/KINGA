# P0 Package 4 — User-Executed Authenticated Portal Route Acceptance Checklist

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Purpose:** Validate authenticated portal-shell routing after the P0 Package 4 authorization consolidation. This checklist performs no claim, policy, premium, payment, settlement, repair, or customer-data action.

## Preparation

Use the published KINGA site in a normal browser session. Begin at `/`, confirm the KINGA landing page remains visible, then sign in with the platform-super-admin account. Do not select a tenant, open a claim, submit a form, or execute any financial or workflow action during this checklist.

## Platform-Super-Admin Shell Matrix

| Portal surface | URL | Expected shell-level outcome |
|---|---|---|
| Landing | `/` | KINGA landing page remains available. |
| Platform | `/platform/overview` | Platform shell opens. |
| Administration | `/admin/dashboard` | Administration shell opens. |
| Insurer | `/insurer-portal` | Insurer portal selection/shell opens without a redirect loop. |
| Assessor | `/assessor/dashboard` | Assessor shell opens. |
| Panel Beater | `/panel-beater/dashboard` | Panel Beater shell opens. |
| Agency | `/agency` | Agency service workspace shell opens. |
| Fleet | `/fleet` | Fleet shell opens. |
| Fleet Driver | `/fleet/driver` | Driver shell opens. |
| Engineers | `/engineer/dashboard` | KINGA Engineers shell opens. |
| Client | `/client` | My Portal shell opens. |

For every row, record **Pass**, **Stable unavailable/forbidden**, or **Fail**. A fail includes a repeated loading state, redirect loop, blank screen, React error, or landing at the retired portal hub.

## Object-Boundary Checks

The following checks confirm that portal-shell access has not been mistaken for data authority.

| Check | Expected outcome |
|---|---|
| Open a tenant-bound claim/report/document URL using an ID from another tenant, without selecting that tenant through an authorised audited mechanism. | No foreign object data is disclosed. The application returns a stable denial or unavailable state. |
| Open a same-tenant object for a legitimate role account, where available. | Existing authorised behavior remains available. |
| Open a restricted insurer sub-role URL while signed in as an ordinary insurer role with a different sub-role. | A truthful `Portal Not Available for Your Role` state appears with **Go to My Workspace**; it must not loop or return to the retired portal hub. |

## Evidence to Return

Return a compact table containing the URL, observed outcome, and any exact error message. Do not include customer claim contents, personal data, documents, policy details, or screenshots containing sensitive information. Any failed row remains an external acceptance gate and will be diagnosed as a separate controlled batch if it requires a scope expansion.
