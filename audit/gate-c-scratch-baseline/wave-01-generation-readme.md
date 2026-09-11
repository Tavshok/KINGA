# Gate C Wave 1 — Identity and Tenant Roots

This directory contains only review artefacts for the first Gate C baseline wave.
The schema export re-exports the authoritative `drizzle/schema.ts` declarations
for `users`, `tenants`, and `tenant_invitations`; it does not duplicate fields,
embed a connection string, or access a database.

The generation command must use the `mysql` dialect, the Wave 1 schema export,
and an output directory inside this audit package. Its output is scratch-review
SQL only. It is not part of the historical migration journal and must not be
applied to `kinga_staging`, production, or any non-loopback database.

The generated SQL is eligible for local scratch replay only after review confirms
that it contains exactly the three selected tables, their declared primary/unique
indexes, and no `DROP`, `ALTER`, or unexpected object.
