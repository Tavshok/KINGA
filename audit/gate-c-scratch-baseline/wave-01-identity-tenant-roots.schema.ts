/**
 * Gate C Wave 1 source export.
 *
 * This file deliberately re-exports the three reviewed canonical schema
 * declarations instead of duplicating them. `drizzle-kit generate` uses it
 * only to produce scratch-review SQL under this audit directory; it is never
 * an application migration configuration and it contains no database URL.
 */
export { tenantInvitations, tenants, users } from "../../drizzle/schema";
