# Engineering Inspection Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Findings

The Engineering Workspace originally checked inspection ownership or administrative shell status but did not bind inspection records to the actor's tenant. Consequently, an administrative shell user could access an inspection in another tenant by numeric identifier. Inspection listings also omitted tenant scope for administrative users. Manual assignment accepted an arbitrary engineer ID. Measurement and observation flows linked arbitrary document IDs after creating the measurement or observation, and inspection-to-claim linking accepted an arbitrary claim ID.

## Correction

The shared inspection access helper now requires the actor's tenant to equal the inspection tenant before ownership or administrative-shell logic is evaluated. Every inspection read, workflow change, AI/physics action, capture action, and approval path passes the session tenant to that helper. Lists always apply the actor tenant. Manual assignment requires both the target inspection and engineer profile to be in that tenant.

Claim-document evidence is validated by joining the document to its claim and requiring the claim tenant to equal the inspection tenant **before** a measurement or observation is inserted. Inspection claim linking uses the same inspection boundary and validates a non-null target claim in the actor tenant before update.

| Boundary | Corrected behaviour |
|---|---|
| Inspection reads and workflow actions | Exact tenant plus assigned/creator relationship, or administrative shell within the same tenant. |
| Administrative listing | Current tenant only; no implicit all-tenant list. |
| Manual engineer assignment | Same-tenant inspection and same-tenant engineer profile required. |
| Measurement/observation evidence link | Every supplied document must resolve through a claim in the inspection tenant before the new record is created. |
| Inspection-to-claim link | Same-tenant inspection and target claim required before update. |

## Verification

The isolated actual-procedure regression passed **2/2**. It proved an engineer can retrieve only the tenant-bound inspection assigned to them; a foreign inspection cannot be read, updated, linked, or assigned even by an administrative-shell user from a different tenant; and invalid evidence IDs are denied before any measurement write.

Final direct verification found zero synthetic inspections, measurements, engineer profiles, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production inspection, engineering measurement, observation, claim, document, policy, payment, settlement, or financial record changed.

## References

1. [Inspection router](../server/routers/inspections.ts)
2. [Actual authority regression](../server/engineer/inspectionAuthority.p0.test.ts)
3. [Inspection schema](../drizzle/schema.ts)
