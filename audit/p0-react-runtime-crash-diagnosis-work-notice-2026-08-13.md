# P0 React Runtime-Crash Diagnosis Work Notice

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 13 August 2026  
**Status:** Proposed — no diagnosis or product change authorised until explicit approval

## 1. Observed concern

The prior portal-conformance backlog records an unresolved production route failure reported as a minified React error #130. The available sandbox preview currently exposes an environment-level **Upgrade Required** page rather than a reproducible authenticated application route. That page is not evidence that the application error is resolved, reproduced, or caused by any current component.

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
