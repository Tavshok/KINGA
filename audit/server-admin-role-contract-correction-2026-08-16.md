# Server Administrative Role Contract Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Several production server routes separately compared a user's role with `admin` and `platform_super_admin`. The project already defines `isAdminRole()` as the canonical administrative-shell contract. Divergent inline checks create a maintenance risk: a route may eventually admit one administrative role while another route does not.

## Correction

Direct administrative equality comparisons were replaced with `isAdminRole()` in the intelligence, fleet, insurance, and engineering inspection routes. Fleet manager admission now explicitly combines fleet-manager/fleet-admin roles with `isAdminRole()`. The shared helper remains the sole place that defines which roles belong to the administrative shell.

| Area | Preserved outcome |
|---|---|
| Intelligence | Both administrative shell roles retain authorised intelligence access. |
| Fleet | Both administrative shell roles retain driver-assignment and fleet-intelligence oversight. |
| Insurance | Both administrative shell roles retain controlled quote oversight. |
| Engineering inspections | Both administrative shell roles retain list, assignment, and ownership override behaviour. |

## Verification

The deterministic role-contract regression proved that `admin` and `platform_super_admin` both pass the shared helper and that audited production routes contain no direct `admin` equality comparisons. The final server-wide scan found no prohibited direct `admin` equality outside the shared helper definition. Exact `platform_super_admin` checks remain intentionally in platform-only guards because those boundaries must reject the ordinary `admin` role and therefore cannot use `isAdminRole()`.

The focused suite passed **38/38**. The bundled server and Vite production builds passed; Vite emitted only the existing large-chunk advisory. No users, tenants, claims, policies, quotations, payments, inspections, vehicles, or financial records changed.

## References

1. [Shared role contract](../shared/role-permissions.ts)
2. [Deterministic compliance regression](../server/adminRoleContract.p1.test.ts)
3. [Fleet route](../server/routers/fleet-core.ts)
4. [Intelligence route](../server/routers/intelligence.ts)
5. [Engineering inspection route](../server/routers/inspections.ts)
