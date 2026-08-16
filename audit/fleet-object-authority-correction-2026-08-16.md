# Fleet Object-Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

Several exposed fleet procedures delegated to unconstrained data helpers. A logged-in caller could request a fleet by numeric ID or list its vehicles without a fleet relationship check. Vehicle registration accepted a supplied fleet ID without proving that the manager controlled that fleet. Fleet creation also lacked the fleet-manager admission boundary. In addition, administrative shell roles received unqualified all-fleet management-intelligence scope rather than their current tenant/relationship scope.

## Correction

The fleet router now uses two reusable boundaries. `requireManagedFleet` restricts fleet creation, driver assignment, vehicle registration, and management intelligence to fleet managers, fleet administrators, or administrative shell users **within their managed owner/tenant fleet scope**. `requireFleetReadAccess` additionally lets an active, formally assigned fleet driver read only that assigned fleet and its vehicles.

Administrative shell roles retain fleet portal access for testing, but no unselected cross-tenant object authority is granted. A later explicit audited cross-tenant scope would be required for that purpose.

| Procedure | Corrected authority boundary |
|---|---|
| `createFleet` | Fleet-manager or administrative-shell role required. |
| `getFleetById` | Managed-fleet or active assigned-driver relationship required. |
| `getFleetVehicles` | Managed-fleet or active assigned-driver relationship required. |
| `registerVehicle` | Fleet-manager authority required; supplied fleet ID must be managed by the actor. |
| `onboardFleetDriver` | Fleet-manager authority and target fleet scope required. |
| `getManagerIntelligence` | Returns only managed owner/tenant fleet data; no implicit all-fleet administrative scope. |

## Verification

The actual isolated procedure regression created two random fleet tenants, managers, an assigned driver, fleets, and vehicles. It proved that a manager and assigned driver can read only their authorised fleet, while a foreign manager and an unassigned driver receive `NOT_FOUND`. It also proved driver creation, foreign vehicle registration, and foreign driver assignment are denied before writes, and management intelligence excludes the foreign fleet.

The focused suite passed **3/3**. The server bundle and Vite production build passed; Vite emitted only the existing large-chunk advisory. A final direct database check found zero synthetic fleet, vehicle, driver, and user records.

No production fleet, vehicle, driver, claim, policy, payment, settlement, or financial record changed.

## References

1. [Fleet router](../server/routers/fleet-core.ts)
2. [Actual authority regression](../server/fleet/fleetObjectAuthority.p0.test.ts)
3. [Fleet data helpers](../server/fleet/fleet-db.ts)
