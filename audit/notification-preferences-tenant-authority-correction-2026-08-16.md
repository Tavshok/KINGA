# Notification Preference Tenant Authority Correction

**Author:** Tavonga Shoko, Lead Engineer  
**Date:** 16 August 2026  
**Status:** Corrected and verified

Notification preference retrieval and upsert now require a session tenant. Reads filter by both the authenticated user and tenant; inserts persist the required session tenant rather than an empty fallback. The focused regression passed **1/1**; bundled server and Vite builds passed with only the existing large-chunk advisory. No notification, preference, claim, policy, payment, settlement, or financial record changed.

## References

1. [Notifications router](../server/routers/notifications.ts)
2. [P1 regression](../server/notificationPreferencesTenantAuthority.p1.test.ts)
