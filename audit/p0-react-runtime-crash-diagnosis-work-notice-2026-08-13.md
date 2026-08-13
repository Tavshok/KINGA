# P0 React Runtime-Crash Diagnosis Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no diagnosis or product change authorised until explicit approval

## 1. Observed concern

The prior portal-conformance backlog records an unresolved production route failure reported as a minified React error #130. The available sandbox preview currently exposes an environment-level **Upgrade Required** page rather than a reproducible authenticated application route. That page is not evidence that the application error is resolved, reproduced, or caused by any current component.

### Diagnostic observation — published landing route, 13 August 2026

The published landing URL initially rendered the application loading state, then redirected to the Manus sign-in page because the diagnostic browser session had no authenticated KINGA session. No application portal component, React error overlay, browser console error, or minified error #130 was observable before that authentication redirect. This is an **authentication-bound diagnostic limitation**, not evidence of a resolved or reproduced application crash.

## 5. Diagnostic findings — 13 August 2026

| Evidence area | Observation | Diagnostic implication |
|---|---|---|
| Published root route | The public root showed the application loading state and then entered OAuth from an unauthenticated browser session. | The reported protected-route crash cannot be reproduced until an authenticated role/route is available for testing. |
| Lazy route modules | Static inspection found no relative lazy module in `App.tsx` without a default export. | There is no current static evidence of the common React #130 lazy-import/default-export failure. |
| Historic #130 safeguard | The active route module declares the platform and engineering lazy components before `Router` and `App`; the source records this as the prior #130 hoisting safeguard. | The known declaration-order failure mode is not present in the current restored source. |
| Runtime logs | No recent server or source log contains `Element type is invalid`, `Minified React`, `Error caught by boundary`, or `error #130`. | There is no local runtime stack proving a current component-level React crash. |
| Global client error handling | `main.tsx` redirects any tRPC error matching the shared unauthenticated message to OAuth. | A protected request from a component can cause an app-wide sign-in redirect; this explains the observed authentication-bound route transition but does not prove it caused the historic #130 incident. |

## 6. Diagnostic conclusion

The historic minified React error #130 is **not reproducible from the current unauthenticated public route and is not statically evidenced by a missing lazy default export or the previously documented declaration-order defect**. The diagnostic therefore classifies the incident as **unconfirmed and authentication-bound**.

No remediation is authorized or applied. The next evidentiary step, if approved, is an authenticated route reproduction matrix for the role and URL on which the error was originally observed, with the browser console and the error-boundary stack captured before any code change is proposed.

## 2. Diagnostic objective

Identify the precise route, role/session state, component, import/export boundary, rendered child, and console stack associated with any recurrence of the React runtime crash. The diagnosis must distinguish:

| Evidence state | Required conclusion |
|---|---|
| Crash reproducible with route, role, stack, and component evidence | Identify the actual failure path and present a separate remediation notice. |
| Route reaches an environment or authentication wall | Record the external limitation; do not infer an application component failure. |
| No reproduction under the available evidence | Record that the incident remains unconfirmed and request the exact route, time, role, and console stack. |

## 3. Authorised diagnostic actions

The proposed work is read-only and diagnostic-only. It may inspect route registration, lazy imports, exports, error boundaries, route guards, existing tests, development logs, production-compatible bundles, and any user-supplied stack trace or screenshot. It may add no-write reproduction tests only after a reproducible component or route contract is identified.

## 4. Explicit exclusions

This notice does **not** authorise changes to portal behavior, authentication, route admission, claims, quotations, valuations, assessments, policies, commissions, repairs, payments, settlements, production data, models, or external providers. It does not authorize speculative component rewrites or trial-and-error fixes.

## 5. Acceptance criteria

The diagnosis is complete only when it supplies one of the following evidence-backed outcomes: a reproducible failure with exact route/component/stack; an explicit external environment/authentication limitation; or a documented non-reproduction with the specific user evidence required to continue. Any code fix must be presented in a separate work notice and explicitly approved.
