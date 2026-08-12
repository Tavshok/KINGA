# P0 Package 4 User Route Acceptance Checklist

**Author:** Tavonga Shoko, Lead Engineer  
**Purpose:** Complete the remaining authenticated browser gate without transferring browser control or sharing credentials.

## Before starting

Sign in to the published site as the account whose top-level role is `platform_super_admin`. Start at the published landing page and wait for it to resolve to **Platform Overview**. If it does not, record the displayed URL and the message shown.

> The purpose of this check is route-shell admission and deterministic behaviour. It does **not** authorise testing against a foreign customer claim, report, document, or workflow object unless an existing explicit tenant-selection feature is being used.

## Portal-shell route checks

Open each route in the same authenticated browser session. The expected outcome is a loaded shell or a clear unavailable/unauthorised page; none should produce a redirect loop, blank shell, or permanent “Verifying access” state.

| URL | Expected result | Record as pass when |
|---|---|---|
| `/platform/overview` | Platform Overview loads. | The page is usable and contains no loop. |
| `/admin/dashboard` | Admin Overview shell loads. | The route does not deny the platform-super-admin. |
| `/admin/tenants` | Tenant Management shell loads. | The page loads; do not change any tenant. |
| `/admin/users` | User Management shell loads. | The page loads; do not edit a user. |
| `/admin/audit-log` | Audit Log shell loads. | The page loads. |
| `/client` | My Portal shell loads. | The page loads without redirecting to a deprecated hub. |
| `/insurer-portal` | Insurer portal selection shell loads. | The page loads and, where shown, displays the administrative override indicator. |
| `/insurer-portal/executive` | Executive shell loads or shows a named unavailable state. | It must not show mock claims, fake scores, or a route loop. |
| `/agency` | Agency service workspace shell loads. | The page loads. |
| `/fleet` | Fleet Management shell loads. | The page loads. |
| `/fleet/driver` | Fleet Driver shell loads. | The route resolves to the driver workspace, not the fleet wildcard. |
| `/engineer/dashboard` | KINGA Engineers shell loads. | The page loads. |
| `/panel-beater/dashboard` | Panel Beater shell loads. | The page loads. |
| `/assessor/dashboard` | Assessor shell loads. | The page loads. |

## Object-boundary negative checks

Do not use real foreign customer data. If an already-known harmless test object is available in a different tenant, request its detail only through a route that normally supports it and confirm that the application returns a named unavailable/forbidden state rather than data. Do not attempt mutation, download, payment, allocation, re-run, or deletion actions.

| Check | Expected result |
|---|---|
| Foreign claim/report/document direct identifier with no explicit selected tenant context | Unavailable or forbidden; no sensitive object fields. |
| Ordinary non-admin role visits `/admin/dashboard` | Denied or redirected to a role-appropriate state. |
| Explicit platform-super-admin cross-tenant feature, where a tenant selector is displayed | Requires selected tenant; the operation becomes auditable. |

## What to send back

For each failed row, send only: **URL**, **what appeared**, and a screenshot if you are comfortable sharing it. Do not send credentials, policy numbers, claimant names, customer documents, or payment details. A concise response such as `PASS: /platform/overview, /admin/dashboard; FAIL: /fleet — loop to /unauthorized` is sufficient.

## Current deterministic evidence

Before this user-side gate, Package 4 has passed 26 deterministic tests across the tenant-administration guard, client route policy, and the Package 1 report/agency/intelligence tenant-boundary suites. Bundled server and Vite production builds also passed. This checklist is the final non-invasive confirmation of published-session route behaviour.
