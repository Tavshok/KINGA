# Platform Impersonation Safety Suspension

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Unsafe session switching suspended; replacement design pending

## Finding

The platform-super-admin impersonation endpoint could issue a session token for any non-super-admin user using only a target user ID and a caller-provided reason. It did not require an explicit selected tenant that matched the target, did not persist the target user or reason in the audit record, used a one-year browser cookie for a one-hour token, and ended all active audit sessions for the platform user rather than an identified impersonation session.

The capability conflicted with the approved boundary that platform-super-admin may test portal shells but must not receive implicit cross-tenant object authority.

## Immediate Safety Correction

The server mutation now fails closed before target lookup, session-token issuance, audit insertion, or cookie mutation. The dedicated impersonation page presents an explicit unavailable state. Direct platform-super-admin portal shell testing remains available; user-session switching does not.

## Verification

The suspension regression passed **1/1**, proving the executable server mutation cannot invoke target session-token creation and the user interface declares the feature unavailable. The bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory. No user session, audit record, claim, tenant record, policy, payment, settlement, or financial record changed.

## Controlled Follow-up

The feature must remain disabled until an approved replacement supplies explicit selected-tenant confirmation, target-user eligibility, durable target and reason audit fields, one-hour session-cookie policy, individual-session revocation, and object-level tenant controls after entry.

## References

1. [Platform marketplace router](../server/routers/platform-marketplace.ts)
2. [Unavailable impersonation page](../client/src/pages/PlatformImpersonate.tsx)
3. [Suspension regression](../server/platformImpersonationSuspension.p0.test.ts)
