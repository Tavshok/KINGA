/**
 * Gate C Wave 2 SQL-generation configuration.
 *
 * `drizzle-kit generate` reads this file to derive review SQL from the exact
 * source export. Generation has no database credentials and never contacts a
 * staging, production, or managed environment.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./audit/gate-c-scratch-baseline/wave-02-vehicle-claim-core.schema.ts",
  out: "./audit/gate-c-scratch-baseline/wave-02-generated/drizzle-kit",
});
