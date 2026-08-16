# Agency Insurer Quote-Request Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

## Finding

The agency broker router dispatched insurer quote requests using a caller-supplied claim ID without first confirming that the claim belonged to the authenticated agency tenant. Its quote-request list endpoint accepted a claim ID and returned every insurer request for that claim without filtering `agencyTenantId`. Together, the two paths allowed foreign claim-targeted dispatch attempts and response enumeration.

## Correction

`agencyBroker.requestQuotes` now resolves the target claim within the authenticated agency tenant before it checks duplicates or inserts requests. `agencyBroker.getQuoteRequests` derives the agency tenant from the session and filters both the requested claim and returned quote requests by that tenant.

The change does not merge agency service records with claimant records, does not issue a policy, and does not alter underwriting, premiums, commission, claims, settlement, or insurer response rules.

## Verification

The isolated actual-procedure regression passed **2/2**. It proves an agency receives only its own quote-request history and that a foreign claim dispatch is denied before an insurer quote-request row is created. Final direct verification found zero synthetic requests, claims, and users. The bundled server and Vite production build passed; Vite emitted only the existing large-chunk advisory.

No production claim, quote request, policy, premium, commission, payment, settlement, or financial record changed.

## References

1. [Agency broker router](../server/routers/agency-broker.ts)
2. [Actual authority regression](../server/agency/insurerQuoteRequestAuthority.p0.test.ts)
