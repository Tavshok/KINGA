# WorkOS Package E Provider-Neutral Client Navigation Implementation

**Date:** 19 September 2026
**Author:** Manus AI
**Status:** Source-review candidate; inactive with respect to WorkOS.

## Conclusion

Package E replaces direct client-side Manus login and account-recovery URL construction with a single **provider-neutral navigation facade**. The implementation intentionally preserves the live Manus behavior. It does not add a browser WorkOS route, request, configuration value, feature switch, provider-selection rule, or user-visible WorkOS action.

The facade is therefore an abstraction boundary only. **Manus remains the sole client login and recovery provider after this package is merged.** WorkOS continues to be controlled solely by the server-side, default-off Package D feature gate.

## Implemented boundary

`client/src/auth/login-navigation.ts` owns the active provider adapter. It produces the same Manus `/app-auth` URL with the existing application identifier, origin-derived callback URI, `type=signIn`, and plain-base64 callback-only `state`. It retains the current browser-local return-path handling under `RETURN_PATH_STORAGE_KEY`; it excludes `/login` and `/portal-hub` from that storage handoff. Account recovery remains the current Manus `forgotPassword` URL with the callback URI and has no `state` or return-path side effect.

The active client integration locations now delegate to that facade. `Login.tsx` supplies both the primary sign-in journey and recovery. The other delegate locations are the global unauthenticated tRPC handler, `useAuth`, `DashboardLayout`, `ClientPortal`, `ClientProfile`, `InviteAccept`, and `PortalSelection`. `PortalSelection` retains its three existing journey variants through the same integration location. The unused `getLoginUrl` import in `ImpersonationBanner` was removed; its logout behavior was not changed.

`useAuth` now creates its optional unauthenticated redirect URL only when that redirect is actually requested. No current caller enables that option. This preserves the destination and avoids constructing an unused provider URL during normal hook evaluation.

## Boundaries deliberately retained

Package E does not change the existing Manus callback, state format, cookie/session semantics, recovery behavior, return-path behavior, labels, or redirect authority. It does not import Package C or D code into the client. It neither repairs nor broadens the known legacy Manus return-path behavior; that requires a separately authorized hardening package.

The browser has no WorkOS configuration or selection logic. There are no WorkOS `VITE_*` values, `/api/auth/workos/start` calls, client feature checks, prefetches, automatic effects, DOM values, or browser-storage writes in this package.

## Validation

The focused guarded suite passed **6 tests in 1 file** using `pnpm test -- server/provider-neutral-login-navigation.test.ts`. The test proves exact Manus sign-in state construction, return-path storage, both loop exclusions, imperative navigation, recovery isolation, all nine documented integration locations, and absence of WorkOS browser references. The command is routed through the fail-closed isolated Vitest wrapper and did not access the application database.

`pnpm run check:server` passed. `git diff --check` passed. A comparison against a detached worktree at the current `user_github/main` commit `f88bdc65` found the same 1,001 inherited TypeScript diagnostics on branch and base. After normalizing temporary-worktree paths and locations, the comparison reported **zero new** and **zero resolved** diagnostics. Existing diagnostics in `ClientPortal`, `ClientProfile`, and `Login` were present in the base and are unrelated to this navigation refactor.

The existing post-login browser specification was corrected to decode only the actual plain-base64 callback URI carried in Manus `state`; it no longer models a hypothetical JSON `returnPath` state contract. The file has legacy whole-file Prettier drift, so formatting it would have produced 54 additions and 77 deletions unrelated to this scope. That broad rewrite was intentionally not included.

## Independent review

The independent security/frontend review approved the implementation without required changes. It confirmed preservation of the active Manus URL contract, delegation of every active integration location, WorkOS absence from the browser, behavior-preserving lazy `useAuth` evaluation, narrow scope, and strong focused regression coverage.

## Deferred work and activation order

Package E does not activate WorkOS. Package D remains disabled until its explicitly recorded deployment sequence is followed: apply migration `0061`, verify `workos_auth_transactions` and its indexes, configure server-only WorkOS values and canonical callback URI, then enable `WORKOS_HUMAN_AUTH_ENABLED=true` in the separately approved environment. Package F local-session separation, Package G non-human identity separation, and Package H controlled cutover remain separately proposed and authorized.

## References

[1]: ../docs/authentication/workos-package-e-provider-neutral-client-navigation-proposal-2026-09-19.md "WorkOS Package E Provider-Neutral Client Navigation Proposal"
[2]: ../client/src/auth/login-navigation.ts "Provider-neutral login navigation facade"
[3]: ../server/provider-neutral-login-navigation.test.ts "Provider-neutral login navigation regression tests"
[4]: ../docs/02-architecture.md "KINGA Architecture and WorkOS activation sequence"
