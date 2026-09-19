# WorkOS Package E: Provider-Neutral Client Navigation Proposal

**Date:** 19 September 2026

**Author:** Manus AI

**Status:** **Review only.** This proposal authorizes no source implementation, WorkOS configuration, feature activation, database migration, environment change, staging action, production action, or deployment.

## Decision requested

Approve this review-only **Package E** proposal as the fixed scope for a later, separately authorized implementation. The later implementation would move the browser’s direct Manus login and account-recovery URL construction behind one provider-neutral client navigation facade. It would preserve the current Manus navigation behavior while WorkOS remains disabled, replace the nine current client integration locations, and not wire the browser to WorkOS or change which provider is selected.

Package E is an **abstraction boundary**, not an activation package. Its successful implementation leaves Manus as the only login action visible and usable in the application. The WorkOS start route remains absent unless a later, separately approved server-only configuration enables it.

## Current state and inventory

The application currently constructs the Manus sign-in URL in `client/src/const.ts`. The helper builds a Manus `/app-auth` request with the existing callback, plain-base64 state contract, and optional local-storage return-path behavior. Eight source locations invoke that helper, and a ninth integration location in `Login.tsx` constructs the Manus recovery URL directly.

| Client integration location                 | Current purpose                                         | Package E treatment                                                          |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `client/src/main.tsx`                       | Redirect after the exact unauthenticated tRPC error     | Use the facade with no return path.                                          |
| `client/src/_core/hooks/useAuth.ts`         | Supplies the optional unauthenticated redirect default  | Resolve the default login URL lazily only if that optional redirect is used. |
| `client/src/components/DashboardLayout.tsx` | Unauthenticated dashboard fallback                      | Use the facade with no return path.                                          |
| `client/src/pages/ClientPortal.tsx`         | Client portal sign-in fallback                          | Use the facade with `/client`.                                               |
| `client/src/pages/ClientProfile.tsx`        | Profile sign-in fallback                                | Use the facade with `/my-profile`.                                           |
| `client/src/pages/InviteAccept.tsx`         | Invitation-account mismatch or unauthenticated recovery | Use the facade with the current invitation return path.                      |
| `client/src/pages/Login.tsx`                | Primary Manus sign-in action                            | Use the facade with the current decoded return path.                         |
| `client/src/pages/PortalSelection.tsx`      | Protected journey and generic sign-in actions           | Use the facade with the existing journey-specific or empty return path.      |
| `client/src/pages/Login.tsx`                | Password-recovery URL construction                      | Use the facade’s provider-neutral account-recovery method.                   |

`PortalSelection.tsx` contains three invocations for these journey variants, but they remain one integration location because they use the same navigation contract. `ImpersonationBanner.tsx` has an unused `getLoginUrl` import but does not launch sign-in; Package E may remove that unused import without changing its distinct logout behavior.

## Proposed implementation boundary

Package E would add a small client-owned module, tentatively `client/src/auth/login-navigation.ts`. It would expose intent-level methods such as `getDefaultLoginUrl(returnPath?)`, `startDefaultLogin(returnPath?)`, and `getAccountRecoveryUrl()`. Its initial internal adapter is the current Manus URL construction, moved without changing the existing query fields, callback URI, state encoding, local-storage key, excluded loop paths, `window.location.href` navigation style, labels, or `auth.me` state authority.

Every location in the inventory would call this facade rather than reading `VITE_OAUTH_PORTAL_URL`, constructing `/app-auth`, handling provider-specific URL fields, or assigning a provider URL directly. The facade will not import WorkOS code, expose WorkOS settings, call `/api/auth/workos/start`, or inspect the WorkOS feature gate. No `VITE_*` WorkOS variable, query parameter, local-storage value, route prefetch, focus event, hover event, or automatic effect may select or initiate organization sign-in.

The optional `useAuth` redirect default currently evaluates the login URL while resolving hook options, even though no current caller turns on `redirectOnUnauthenticated`. Package E may defer that URL construction until such a redirect is actually requested. This is a narrow evaluation-timing correction; it does not change the selected provider or activate a redirect for any current caller.

## Explicit behavior preserved

The current Manus callback, its state protocol, account-creation behavior, session cookie, JWT payload, logout behavior, recovery destination, and post-login return-path behavior are preserved exactly in Package E. The package must not change the Manus `state` format to carry new data, reuse WorkOS transactions for Manus, or route WorkOS through `/api/oauth/callback`.

The present return-path implementation has known inconsistencies between browser storage, the Manus callback contract, and server-side validation. Package E must **not** silently repair, tighten, or broaden that behavior under the cover of an abstraction refactor. A separate return-path hardening proposal is required before changing it, with dedicated compatibility and adversarial testing. The Package C1/D server-side return-path validator remains the authority only for the disabled WorkOS flow; it is not imported into the Manus path through Package E.

## WorkOS activation dependency

Package D is merged but remains disabled by default. Its migration and table are not required for an environment while `WORKOS_HUMAN_AUTH_ENABLED` is false: the routes, durable store, and verifier-cleanup loop do not execute in that mode. Before any environment enables WorkOS human authentication, the following order is mandatory:

1. Apply migration `0061_workos_auth_transactions`.
2. Verify that `workos_auth_transactions` exists with its primary key and `workos_auth_transactions_expires_at_idx` expiry index.
3. Configure the server-only WorkOS values, including the canonical callback URI.
4. Set `WORKOS_HUMAN_AUTH_ENABLED=true` for that approved environment.

The browser must never substitute for this order. Package E does not configure values, register a redirect URI, enable the flag, or alter the WorkOS route’s default-off posture.

## Acceptance and regression plan

Implementation approval would require focused client tests proving that every integration location delegates to the facade and that the facade produces the present Manus sign-in and recovery URLs. The tests must cover each existing return-path argument, the no-return-path case, current loop exclusions, local-storage side effects, lazy `useAuth` evaluation, and the exact global unauthenticated-error trigger.

Browser coverage must prove the default rendered login journey is unchanged: Manus remains the primary action, no WorkOS request occurs during page load/navigation/focus, and no WorkOS value reaches the DOM, URL, browser storage, analytics, or client configuration. Existing post-login tests must be corrected to assert the actual legacy Manus state contract rather than a hypothetical JSON state format. The suite must remain hermetic and run only through the fail-closed `kinga_ci_test` wrapper.

## Scope excluded from Package E

Package E excludes WorkOS account or application setup, secrets, redirect-URI registration, environment configuration, feature-flag activation, client provider selection, organization sign-in UI, provider availability endpoints, WorkOS transaction changes, callback changes, linking changes, provider-token handling, user or tenant creation, database changes, session/JWT changes, staging, production, deployment, and data operations.

It also excludes the next agreed packages: **Package F** local session separation, **Package G** non-human identity separation, and **Package H** controlled cutover. Those packages must each receive their own proposal, implementation authorization, isolated branch, tests, review, and merge decision.

## Rollback and stop conditions

Because this package only centralizes the existing Manus navigation code, rollback is a source rollback to the prior direct calls. Any observed change to the generated Manus URL, state value, callback target, recovery URL, login action label, return-path side effect, unauthorized redirect timing, or current authentication/session behavior stops the implementation review. Any direct WorkOS browser request, client-exposed WorkOS configuration, or feature activation is out of scope and is an immediate stop condition.

## Next decision after proposal review

Approval of this document approves **only the Package E design boundary**. It does not authorize an implementation branch, a source change, a test change, or a pull request.

A later implementation request must seek separate, explicit owner approval. If granted, that request would use an isolated branch to create the client navigation facade, migrate only the nine documented integration locations, add focused test coverage, obtain independent review, and open a source review PR. It would still not enable WorkOS or change the active Manus behavior.

## Independent proposal review

The first independent review blocked publication because the initial closing language could be read as implementation authority despite the document’s review-only status. The corrected proposal now states that approval authorizes only the design boundary and expressly prohibits an implementation branch, source change, test change, or pull request without a later explicit owner decision. The final independent review approved the corrected proposal with no required changes. It also confirmed that Manus behavior remains preserved, WorkOS remains absent from the client, and the WorkOS feature remains default-off.

## References

[1]: workos-package-d-callback-linking-proposal-2026-09-19.md "WorkOS Package D: Callback and Guarded Local-Linking Proposal"
[2]: ../../audit/workos-package-d-callback-linking-implementation-2026-09-19.md "WorkOS Package D Callback and Guarded Linking Implementation"
[3]: ../../server/_core/oauth.ts "Current Manus OAuth callback"
[4]: ../../client/src/const.ts "Current client Manus login URL helper"
