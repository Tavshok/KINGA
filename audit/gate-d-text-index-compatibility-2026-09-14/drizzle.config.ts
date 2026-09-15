import { defineConfig } from "drizzle-kit";

/**
 * Source-derived compatibility evidence only. Drizzle Kit reads the canonical
 * schema and writes SQL locally; the placeholder URL is never contacted.
 */
export default defineConfig({
  schema: "/home/ubuntu/kinga-replit-d04-packet/drizzle/schema.ts",
  out: "/home/ubuntu/kinga-replit-d04-packet/audit/gate-d-text-index-compatibility-2026-09-14/drizzle-kit",
  dialect: "mysql",
});
