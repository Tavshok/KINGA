import { defineConfig } from "drizzle-kit";

/**
 * Generates source-derived compatibility evidence only. `drizzle-kit generate`
 * reads the canonical schema but does not contact the placeholder endpoint.
 */
export default defineConfig({
  schema: "/home/ubuntu/kinga-replit-d03-packet/drizzle/schema.ts",
  out: "/home/ubuntu/kinga-replit-d03-packet/audit/gate-d-text-default-compatibility-2026-09-14/drizzle-kit",
  dialect: "mysql",
  dbCredentials: {
    url: "mysql://source_derivation_only:source_derivation_only@127.0.0.1:3306/source_derivation_only",
  },
});
