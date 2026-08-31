# Schema ↔ Migration Drift — Remediation Plan

Produced per the task that followed `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md`
("do NOT write or run any migration yet — produce a written remediation
plan first").

**This document contains no migrations and no code changes.** It is a plan
for a separate, reviewed execution task. Everything below describes what
should happen, in what order, and how each step gets verified before the
next one starts — not a migration script.

---

## 0. The one assumption this plan refuses to make

The audit's numbers (89 missing tables, 209 missing columns) are a diff of
**`schema.ts` vs. the checked-in `drizzle/*.sql` files**. They are not a
diff against any *actual running database*. The audit itself documents
several reasons those two things can already disagree in this project:

- The readiness doc (Section 4.4) records that neither `drizzle-kit
  migrate` nor `drizzle-kit push` worked cleanly against a fresh local DB,
  and that tables were hand-reconstructed from `schema.ts` to unblock work.
  If that happened once, on a database anyone had shell access to, it is a
  live possibility that it happened elsewhere too — including against
  whatever database backs staging or production today.
- The audit's own Part 3 shows the migration files themselves are not a
  reliable record of "what was applied": `0056`–`0059` are skipped by the
  journal (item 5), `0058` fails partway through (item 3), `0045` fails
  partway through (item 4), and one table's migration exists entirely
  outside the numbered sequence (item 6). A plain `drizzle-kit migrate`
  replay of this repo, today, does not produce a database that matches
  `drizzle/*.sql`'s own stated intent — let alone `schema.ts`.

Treating "migrations say X" as "the database has X" would be exactly the
kind of static-analysis-only conclusion Section 2 of the readiness doc
warns against ("a claim that something should work based on reading the
code is not sufficient... run it, show the output"). So the plan below
starts by finding out what's actually true in each real environment,
**before** deciding what any migration needs to do.

---

## 1. Safe order of operations

```
Step 0  Reconcile ground truth per environment       (read-only, zero risk)
Step 1  Repair migration-chain integrity              (tooling, no app tables)
Step 2  Generate + verify: 89 net-new tables           (pure CREATE TABLE)
Step 3  Generate + verify: 209 columns on 15 tables    (additive ALTER)
Step 4  Fix the 3 rename/casing bugs                   (data-preserving RENAME)
Step 5  Re-run the audit; close the loop
```

Rationale for this ordering:

- **Step 0 before everything.** Every later step's risk assessment depends
  on knowing what's actually in each database today. Doing this first is
  free (read-only) and can invalidate or resize the whole plan.
- **Step 1 before Step 2/3.** Steps 2 and 3 both lean on `drizzle-kit
  generate` correctly understanding "what's already applied." If the
  journal gap and the two broken migration files aren't fixed first,
  `drizzle-kit` is generating a diff against a state it's already wrong
  about, and the same silent-partial-failure pattern that produced the
  drift in the first place (broken `ALTER`, aborted script, unregistered
  file) will just happen again to the new migrations.
- **Step 2 before Step 3.** New tables are `CREATE TABLE` — there is no
  existing data to endanger, no lock contention on a live table, no
  NOT-NULL-without-default backfill question. It's the lowest-risk tier
  and a good place to prove the reconciled process works before touching
  tables that already hold rows.
- **Step 3 before Step 4.** Step 3 is purely additive (`ADD COLUMN`).
  Step 4 is the one category in this whole gap that is **not** additive —
  it's a rename correction (`claimId` → `claim_id`, and the missing
  `created_at`/`deleted_at` naming) — and a mishandled rename is the one
  way this remediation could actually **lose** data (write to the wrong
  column, or create a duplicate new column while the old one still holds
  the real rows). It goes last, gets the most process, and is not batched
  with anything else.
- **Step 5 closes the loop** by re-running the exact audit methodology
  (structural parse + real-database cross-validation) that produced the
  original report, so "done" is demonstrated the same way the problem was
  demonstrated — not asserted.

---

## 2. Step 0 — Reconcile ground truth per environment

**Goal:** for every environment that has a database (local/dev, staging,
production — whichever of these actually exist; the readiness doc doesn't
yet say where KINGA deploys, per Section 6 item 4, so this step also
produces that inventory as a side effect), answer: *does this specific
database actually have each of the 89 tables / 209 columns, independent of
what `drizzle/*.sql` says?*

**How:**
1. Enumerate every environment with a live `DATABASE_URL`.
2. Against each one, run a read-only introspection (`information_schema`
   query, or `drizzle-kit introspect`, or the audit script's own
   `information_schema` cross-validation approach — same method Part of
   the audit already used to validate its 129-table count against a fresh
   container) to get the *actual* table/column list.
3. Produce a 3-way comparison per environment: `schema.ts` vs.
   `drizzle/*.sql` (already done, in the audit) vs. *this environment's
   real state*.
4. Classify every one of the 89+209 gap items per environment into:
   - **Already present** — the live DB has it; the gap is purely
     migration-file/documentation debt. No `ALTER`/`CREATE` needed against
     this environment at all; only a corrective migration file needs to
     exist so the *next* fresh environment doesn't have to hand-reconstruct
     it the way Section 4.4 describes.
   - **Genuinely absent** — the live DB really doesn't have it. This is
     the actual "needs a real migration run against this database" set.

**Verification gate before Step 1 starts:** a written per-environment
table (even a short one — env name, table/column counts in each of the
three categories) reviewed by a human. This is the artifact that turns
"89 tables are missing" into "here is exactly what has to change, and
where" — which may be a much smaller and differently-shaped task once
production's real state is known. If it turns out production already has
most of this (plausible, given push was used historically per Section
4.4), Steps 2–4 shrink to "write the missing migration files" with no
`ALTER`/`CREATE` risk at all, only a re-verification that the file, once
generated, produces a no-op diff against prod.

---

## 3. Step 1 — Repair migration-chain integrity

Fixes the audit's Part 3 findings. None of these touch the 89+209 gap
directly — they fix the tooling so Steps 2–3 can trust it.

| Item | Fix | Why it has to come first |
|---|---|---|
| Journal gap (`0056`–`0059` unregistered) | Add the missing journal entries so `drizzle-kit migrate` actually applies these four files | Without this, any newly-generated migration is appended *after* a gap `drizzle-kit` doesn't know exists, compounding the problem |
| `0058_claim_comments_extend.sql` renames a column (`userId`) that was never the real name | Replace the bad `CHANGE COLUMN` statement with one targeting the real column (`user_id`), as a **new** corrective migration — don't hand-edit `0058` in place if there's any chance it already partially ran somewhere (see Step 0) | An `ALTER TABLE` that aborts mid-statement takes the rest of that file's changes down with it (MySQL CLI stops on first error) — this is the same failure mode that produced part of the current drift and must not repeat for `claim_comments`'s other 25 missing columns |
| `0045_colossal_molecule_man.sql` fails on an unindexed-length `TEXT` column | New corrective migration adding the two indexes that never got created, this time with an explicit key-length prefix (e.g. `(recipients(255))`) | Same reasoning — a silently-partial migration file is exactly what caused the `ai_assessments.stage2_raw_ocr_text` / `narrative_analysis_json` false-negative the audit had to call out separately |
| `rate-limit-tracking-schema.sql` outside the numbered sequence | Fold it into the numbered sequence with a proper journal entry (it already matches `schema.ts`, so this is pure bookkeeping, not a schema change) | So a future `drizzle-kit generate` run doesn't get confused by an untracked table it can see in the DB but not in its own history |

**Verification gate before Step 2 starts:** replay the full migration
sequence, in order, against a fresh MySQL 8 container from empty — the
same validation method the audit already used (Section: Methodology, item
3). Must complete with **zero errors**, and the resulting table/column
count must match what Step 0 determined the intended "migrations-only"
baseline should be. This is a mechanical, automatable check — script it
once and reuse it as the gate for every subsequent step too.

---

## 4. Step 2 — Generate migrations for the 89 net-new tables

**Mechanism for "generating correct migrations" (not hand-writing 89
`CREATE TABLE` statements):** once Step 1 leaves the migration chain in a
state that cleanly replays to a database matching what `drizzle/*.sql`
claims, run `drizzle-kit generate` with `schema.ts` as the target. Drizzle
diffs the schema against its own understanding of migration-applied state
(now trustworthy, post-Step-1) and emits the SQL mechanically — this
avoids hand-transcription errors across ~1,400 columns, which is itself a
correctness risk the plan should avoid introducing.

**Required human review of the generated output, before applying anywhere
except a scratch database:**
- Confirm every emitted statement is `CREATE TABLE` — nothing in this
  batch should be a `DROP` or `ALTER` on an existing table. If
  `drizzle-kit` proposes anything else, stop and re-check Step 0's
  classification for that table (it may mean the live DB and `schema.ts`
  disagree in a direction the audit didn't cover).
- Check foreign-key ordering in the generated file: several of the 89
  tables clearly reference each other or existing tables (e.g.
  `claim_assignments` → `claims`/`users`, `vehicle_geometry_measurements`
  → `vehicle_models`, `driver_claims` → `drivers`/`claims`). `drizzle-kit`
  generally orders `CREATE TABLE` statements correctly for this, but for a
  batch this large it should be spot-checked, not assumed.
- Cross-reference against Step 0's per-environment classification — a
  table already "genuinely absent" everywhere is a normal `CREATE`; a
  table Step 0 found already present in *some* environment needs the
  migration to be safe as a no-op there too (i.e., confirm the generated
  DDL doesn't collide with an existing table of the same name with
  different structure — flag for manual reconciliation instead of blind
  apply if so).

**Verification before Step 3 starts:**
1. Apply the generated migration to a disposable scratch DB (empty) — must
   succeed cleanly.
2. Apply it to a **sanitized copy of real data** (staging, or a
   masked/anonymized snapshot of production if that's the only place with
   representative data) — not just an empty DB, because empty-DB success
   doesn't prove anything about foreign-key constraints against real
   existing rows in tables like `claims`/`users` that these new tables
   reference.
3. Boot the app against that copy and exercise the code paths that
   reference these tables (e.g. `server/routers/inspections.ts` and its
   `physical_measurements`/`engineer_observations` dependents, flagged
   explicitly in the audit as depending on tables with zero migration
   today) — confirm no runtime error, not just a passing `tsc`.
4. Only after 1–3 pass does this migration get scheduled for the real
   target environment(s) identified in Step 0.

---

## 5. Step 3 — Generate migrations for the 209 columns on 15 existing tables

Same `drizzle-kit generate` mechanism as Step 2, but this tier carries real
risk because it's `ALTER TABLE ... ADD COLUMN` against tables that already
hold rows in any environment where Step 0 found them "genuinely absent."
Two of the fifteen — `claims` (55 columns) and `ai_assessments` (70
columns) — are evidently large, central, frequently-written tables, so
they get extra caution.

**Classification pass, per column, before generating anything:**
- **Nullable, no default required** (the overwhelming majority — things
  like `*_json` fields, optional scores, optional references): safe
  `ADD COLUMN`, effectively instant on MySQL 8 with `ALGORITHM=INSTANT`
  where the engine supports it for that column type.
- **Has a natural default** (e.g. counters, status enums with an obvious
  starting state): `ADD COLUMN ... DEFAULT ...` — still additive, still
  safe, but confirm the default is actually correct for *existing* rows,
  not just new ones (a default that's semantically wrong for old rows is
  a data-correctness bug even though it's not a data-loss bug).
- **Would need `NOT NULL` with no sensible default for existing rows**: do
  **not** generate a single-step `NOT NULL` add against a populated table.
  If the audit's column list contains any of these (needs checking per
  column against real row data, not assumed), use the standard two-phase
  pattern instead — add nullable, backfill with a script informed by real
  data, verify 100% backfilled, *then* a separate migration adds the
  `NOT NULL` constraint. Each phase is its own reviewed step.

**Sequencing for the two hot tables (`claims`, `ai_assessments`):**
- Confirm MySQL 8's instant-`ADD COLUMN` support applies (it does for
  simple nullable column additions at the end of the table in MySQL
  8.0.29+; verify actual server version per environment first) — this
  avoids a full table rewrite/lock on tables that are presumably under
  active read/write load.
- If any column in these two tables can't use instant DDL (e.g. certain
  type/position combinations that force a rebuild), schedule that specific
  `ALTER` for a low-traffic window and measure lock duration on the
  staging copy first — don't discover the lock duration for the first
  time against production.
- Apply in small batches (e.g. by logical grouping — physics/fraud JSON
  fields together, pipeline-tracking fields together) rather than one
  giant 70-column `ALTER`, so a problem in one batch doesn't block or roll
  back unrelated columns, and so review stays tractable.

**Verification before Step 4 starts:** same three-part gate as Step 2
(scratch DB → sanitized real-data copy → app boot + exercise the affected
routers), plus for this step specifically: confirm no existing query
anywhere in `server/` breaks — additive columns are usually safe for
`SELECT *`-style code, but any code doing strict column-count assumptions
(rare, but worth a grep) should be checked. Re-run the drift audit script
against the staging copy afterward and confirm the 209-column gap is
closed there before scheduling production.

---

## 6. Step 4 — The 3 rename/casing fixes (highest care, smallest batch)

These are different in kind from Steps 2–3: they are not "add something
that's missing," they are "the column that exists has the wrong name," and
a naive fix risks the one real data-loss scenario in this whole plan —
if `claimId` were dropped and a new `claim_id` column added instead of
renamed, every existing value would be lost.

1. **`claim_comments.claimId` → `claim_id`** (`schema.ts:734` currently
   passes `"claimId"` as the literal DB column name; the real column, per
   `0002_lively_thundra.sql`, is `claim_id`).
2. **`claim_comments.createdAt` / `.deletedAt`** naming mismatch
   (`schema.ts:752,754` — real column is `created_at`; `deleted_at`
   doesn't exist in migrations at all, so this one is actually a hybrid:
   `createdAt` is a rename, `deletedAt` is a genuine new-column addition
   per Step 3's process).

**Required approach — expand/contract, never a same-step
rename-and-repoint:**
1. **Expand:** Step 3 (or a preceding pass of it) already adds any
   genuinely-missing column (`deleted_at`). For the two true renames
   (`claimId`→`claim_id` is *not* a rename in the DB — the DB column is
   already correctly `claim_id`; this is purely a `schema.ts` code fix, no
   migration needed at all once confirmed. Re-check this against Step 0:
   if the DB already has `claim_id`, the entire fix here is a one-line
   `schema.ts` correction, not a migration, and the earlier
   `access_denial_log`-style precedent (commit `45510480`) applies
   directly — fix the schema-vs-reality drift on the code side).
2. Since `claimId` was never a real column in the database (only in the
   `schema.ts` misdeclaration), there is **no rename migration needed
   here at all** — this reclassifies item 1 from a risky rename down to a
   zero-risk `schema.ts` typing fix, exactly analogous to the
   `access_denial_log.id` / `users.id` `.primaryKey()` fixes already made
   in `ci-fix-01`. Confirm this conclusion against Step 0's live-DB
   introspection before treating it as settled — the audit derived it
   from static+migration-replay analysis, and Step 0's whole purpose is to
   not take that on faith for a column this consequential.
3. `createdAt` is the same situation — if the real column is `created_at`
   and `schema.ts` just names it wrong, this is a `schema.ts` fix, not a
   migration.

**Net effect:** once Step 0's ground truth is known, Step 4 likely
collapses to (a) a small, low-risk `schema.ts` correction for the two
casing bugs — no migration, no data movement, same category as prior
`45510480` — plus (b) one genuinely new column (`claim_comments.deleted_at`)
handled through Step 3's normal additive process. This plan still budgets
for the possibility that Step 0 finds something worse (e.g. a real,
separate `claimId`-named column somewhere holding data that needs a true
merge), because that's the one scenario in this whole 89+209-item gap
that could actually destroy data, and it should not be assumed away
without checking.

**Verification gate:** whichever shape this turns out to be, verify with
an app-level check specifically exercising `claim_comments` reads/writes
against the staging copy (comment creation, resolution, threading via
`parent_comment_id`) before this is considered closed — this table is the
one with the actual bug, so it gets the most scrutiny, not the least.

---

## 7. Step 5 — Close the loop

Re-run the exact audit methodology from `SCHEMA_MIGRATION_DRIFT_AUDIT.md`
(structural parse of `schema.ts` + structural parse of all `drizzle/*.sql`
+ real-database cross-validation) against:
- A fresh container replaying the full (now-repaired) migration sequence.
- Every real environment identified in Step 0.

**Definition of done:** zero tables in "Part 1" territory, zero columns in
"Part 2" territory, zero findings in "Part 3" territory, for every
environment — not just for the migration-files-replayed-to-empty-DB case.
Publish the re-run's output next to the original audit so the before/after
is traceable, the same auditability standard the readiness doc requires
for the calibration spec's own outputs (Section 1, "Persistence
requirement").

---

## 8. Cross-cutting safeguards (apply to every step above)

- **Backup before every apply to a real (non-scratch) environment** —
  independent of the migration itself, ordinary point-in-time backup
  discipline.
- **Never batch a Step-2/3 migration together with a Step-4 migration.**
  Keep the "purely additive, mechanically safe" changes in their own
  migration files, separate from the one category (Step 4) that needs
  manual judgment — so a problem in one doesn't block or entangle the
  other, and so rollback scope stays small and legible.
- **Every migration generated in Steps 2–4 gets applied to a
  sanitized-real-data staging copy before it is scheduled against any
  environment Step 0 identifies as production**, no exceptions, even for
  changes that look obviously safe — this whole gap exists because past
  changes that looked safe (an unindexed `TEXT` column, a `CHANGE COLUMN`
  on a column that turned out not to exist) weren't actually verified
  against a real apply.
- **One human sign-off per step**, not just per migration file — Step 0's
  environment inventory, Step 1's clean-replay confirmation, and Step 4's
  reclassification in particular should each be read and approved by a
  person before the next step starts, since each of those can change the
  shape of the work still to come.
- **This plan produces migration files as its Steps-2/3/4 output, but
  does not schedule or apply any of them** — scheduling against a real
  environment (maintenance window, rollout communication, on-call
  awareness) is explicitly out of scope for the task that produced this
  document and belongs to whoever executes Step 2 onward.
