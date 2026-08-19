# KINGA — Pre-Claude-Code Readiness Spec & To-Do List

Purpose: capture the standing rules, known pain points, and open remediation items
so that when Claude Code is adopted as the primary implementation tool, it starts
from a complete, correct picture of the project rather than rediscovering things
we already know. This document is the seed for `CLAUDE.md`.

---

## 1. Deformation Measurement Calibration Spec (FINAL)

**Problem it solves:** photogrammetric crush-depth / deformation measurements have
no independent check against systematic error (camera distance, angle, lens
variance). A single wrong or drifting measurement pipeline could silently produce
confidently wrong numbers on every claim.

**Method: per-claim reference-dimension recalibration**

1. For every photo set used to measure deformation, identify at least **two
   independent, undamaged reference dimensions** on the same vehicle in the same
   photo set (e.g. windshield width, wheelbase, roof width, door height — chosen
   from panels not affected by the damage being measured).
2. Look up the **true value** of each reference dimension from a manufacturer
   specification source (make/model/year), which needs a data source — see To-Do
   item 1 below.
3. Compute the pipeline's **measured value** for each reference dimension using
   the same photogrammetric method used for the actual deformation measurement.
4. Derive a **correction factor** per reference dimension:
   `correction_factor = true_value / measured_value`
5. **Agreement check:** if the correction factors derived from independent
   reference dimensions agree within a defined tolerance, apply the
   (averaged/reconciled) correction factor to the raw deformation measurement:
   `corrected_value = raw_measured_value × correction_factor`
   This is applied **systematically, on every claim, regardless of the
   underlying cause of the discrepancy** — no root-cause diagnosis required in
   the common case.
6. **Disagreement case:** if independent reference dimensions imply
   meaningfully different correction factors, this is not a "pick one and
   correct" situation — a single scalar correction is not a valid model of
   the error in this photo set. Route to **human review**, do not silently
   average, do not apply an uncorrected raw value, and do not block on
   diagnosing why the disagreement occurred.
7. **Persistence requirement:** store the raw measured value, the corrected
   value, the correction factor(s) applied, and which reference dimension(s)
   produced them — never overwrite raw with corrected. A human engineer
   reviewing a claim later must be able to see exactly what adjustment was
   made and why.
8. **Confidence field** on the measurement should reflect this process
   honestly — not a decorative default. A photo set that fails the agreement
   check, or has no usable reference dimension, should carry visibly reduced
   confidence, not the pipeline's default value.

**Auditability requirement (ties to Section 2):** every corrected value must be
traceable back through raw value → reference dimensions used → correction
factor, without needing to read the code to reconstruct it. This should be
visible in whatever the engineer-facing review UI is for a claim, not just in
a database row.

---

## 2. General Engineering Standing Rules

These apply to all future work, not just physics/photogrammetry:

- **Human-readable and maintainable over clever.** Named intermediate
  variables, inline units, and explicit formulas — even if more verbose —
  especially in physics/measurement code that you personally need to audit.
- **Live verification over static analysis or code review alone.** A claim
  that something "should work" based on reading the code is not sufficient
  for anything security- or measurement-sensitive. Run it, show the output.
- **Tenant isolation is non-negotiable.** No empty-string fallbacks on
  `tenantId`. Authorization must derive from session, never from
  caller-supplied input, even if the caller-supplied value would usually
  match. (See Section 3 for the specific pattern that was hardened and
  tested tonight — use it as the reference implementation.)
- **Canonical data layer, not re-derivation.** Report generators and other
  consumers must read from `resolveClaimRecord()` / `normaliseReportData()`
  rather than independently recomputing fraud score, market value, physics
  results, or decision status. This was the root cause of most cross-report
  contradiction bugs found in past remediation rounds — don't reintroduce it.
- **Audit before build, remediation prompt before implementation.** Established
  working pattern — keep it when handing tasks to Claude Code.
- **Show intermediate outputs for anything measurement-derived**, not just
  final numbers — e.g. the annotated photo with measurement points overlaid,
  not just a crush-depth figure.

---

## 3. Tenant-Authority Reference Implementation (verified tonight)

`server/routers/inspections.ts` on `main` (post commit `3c0f50b2`) is the
reference pattern for tenant-scoped procedures:

- Explicit `if (!tenantId) throw FORBIDDEN` at the top of every procedure
  that touches tenant data — don't rely solely on a shared helper's
  fallback behavior.
- `requireInspectionAccess()` as the shared cross-tenant-read guard,
  returning `NOT_FOUND` (not `FORBIDDEN`) on tenant mismatch, to avoid
  leaking resource existence across tenants.
- Caller-supplied `tenantId`-like fields in input schemas must be ignored
  in favor of session tenant — verified via Zod's default strip-unknown-keys
  behavior (no `.passthrough()` on relevant schemas).
- Denied cross-tenant writes must leave zero side effects — verified via
  before/after state checks, not just return-code assertions.

Test suite: `server/engineer/inspectionAuthority.p0.test.ts` — now the single
consolidated fixture lifecycle for this domain. Do not create parallel
fixture suites for the same tenant-boundary domain; fold new assertions into
the existing one.

---

## 4. Known Outstanding Issues (from tonight's session — verify before Claude Code starts)

1. **Schema drift:** `drizzle/schema.ts` contains columns/tables not present
   in the checked-in `drizzle/*.sql` migrations — confirmed missing:
   `users.phone_number`, `users.secondary_roles`, `physical_measurements`,
   `engineer_observations`, and likely others not yet discovered (only
   found because the test suite happened to touch them). **To-do: run a
   full schema-vs-migration diff, not just the tables this test suite hit.**
2. **`drizzle-kit push` bug:** `access_denial_log` table in `drizzle/schema.ts`
   has an `autoincrement()` column without `.primaryKey()`, which breaks
   `drizzle-kit push` for the entire schema. Needs a one-line schema fix.
3. **No `.env.example` or devcontainer config** in the repo — every fresh
   environment (Codespace, new hire, Claude Code on a new machine) has to
   rediscover `DATABASE_URL` / `JWT_SECRET` / `BUILT_IN_FORGE_API_KEY` /
   `BUILT_IN_FORGE_API_URL` requirements from the README by trial and error.
   **To-do: add `.env.example` with placeholder values and a documented
   local-database setup path (Docker Compose recommended).**
4. **No documented local test-database setup.** Tonight required
   hand-reconstructing 5 tables from `schema.ts` by hand because neither
   `drizzle-kit migrate` (stale migrations) nor `drizzle-kit push` (schema
   bug) worked cleanly. **To-do: fix items 1 and 2, then verify `migrate`
   or `push` works cleanly against a fresh empty database, and document it.**
5. **Manus managed workspace desync**, unresolved on Manus's platform side
   (no supported resync/re-clone action exists as of tonight). Not blocking
   `main`, but means the Manus project instance for `kinga-replit` cannot
   currently checkpoint or publish. Revisit if/when Manus adds a resync
   capability.
6. **Vehicle reference-dimension data source not yet chosen** (needed for
   Section 1's calibration spec). Options: a small internal lookup table
   keyed by make/model/year, a third-party vehicle-spec API, or manual entry
   per vehicle at intake. **To-do: decide and scope before this spec is
   implemented.**
7. **Calibration tolerance thresholds not yet defined** for the
   agreement-check in Section 1 step 5 — needs a documented, reviewable
   number (not a hardcoded magic constant with no rationale).

---

## 5. Suggested Order of Work (before or immediately after adopting Claude Code)

1. Fix the `access_denial_log` schema bug (Section 4.2) — quick, unblocks
   clean `push`/`migrate` for everyone going forward.
2. Full schema-vs-migration audit and reconciliation (Section 4.1) — do this
   properly once rather than discovering gaps table-by-table under test
   pressure again.
3. Add `.env.example` + documented local DB setup (Section 4.3–4.4) — this
   alone would have saved most of tonight's friction and will save it again
   for every future session, human or agent.
4. Decide the vehicle reference-dimension data source (Section 4.6).
5. Define and document the calibration tolerance threshold (Section 4.7).
6. Implement the deformation calibration spec (Section 1) as its own
   audited feature — audit current photogrammetry code first, then a
   remediation prompt, per standing practice (Section 2).
7. Write `CLAUDE.md` from this document once 1–5 are settled, so Claude
   Code's first real session starts from a clean, documented environment
   rather than inheriting tonight's discovery process.

---

## 6. Authentication — Decoupling from Manus

**Problem:** Manus previously managed auth (superadmin impersonation with
scoped tokens, QA seed users under `kinga-qa-internal`, session revocation)
as part of its managed workspace. Moving primary implementation to Claude
Code / an independent environment means auth needs to stand on its own,
not depend on anything Manus-specific.

**To-do:**
1. **Audit what currently depends on Manus-specific infrastructure vs. what's
   already plain application code.** Session revocation, JWT issuance,
   role resolution, and impersonation logic were described as server-side
   and role-resolved in past work — confirm none of that actually depends
   on Manus's runtime/secrets/environment rather than just having been
   *developed* inside a Manus workspace. If it's plain code in the repo,
   this is mostly a non-issue; if any of it references Manus-managed
   secrets or services, those need a replacement source (e.g. your own
   `.env` / secrets manager).
2. **Re-verify the session revocation fix** (the bug where a deleted user's
   JWT remained valid for months) still holds under whatever hosting/runtime
   replaces Manus's managed publishing — this was fixed once under Manus's
   environment; confirm it's environment-independent, not something that
   only worked because of how Manus wired things.
3. **Document the full auth setup** (JWT secret provisioning, superadmin
   impersonation flow, QA seed user creation) in the same place as the
   `.env.example` work in Section 4.3, so a fresh environment can stand up
   working auth without Manus in the loop.
4. **Decide on hosting/publishing** now that Manus's managed publish path
   is blocked for this project (Section 4.5) — where does KINGA actually
   deploy going forward? This is a real open question, not just a dev-loop
   question, and affects how auth secrets get provisioned in production.

---

## 7. Report Consistency and Value

**Problem, already diagnosed in past work:** the root cause of cross-report
contradictions (decision status, fraud score, market value, quote similarity
disagreeing between report tiers) was report generators independently
re-deriving values instead of reading from the canonical
`resolveClaimRecord()` / `normaliseReportData()` layer. This was fixed
across multiple remediation rounds but needs to stay fixed as new report
types or fields get added — it's a pattern that silently regresses if a new
generator is written without going through canonical resolution.

**To-do:**
1. **Add a standing regression test** (if one doesn't already exist) that
   generates all report tiers (CL/CI/FR) for a single test claim and
   asserts the shared fields (decision status, fraud score, market value)
   are byte-identical across tiers — not just visually similar. This turns
   "report generators must use the canonical layer" from a code-review rule
   into an enforced, automated one, the same way the tenant-authority
   assertions were turned into a running test tonight rather than left as
   a documented expectation.
2. **Audit any report-related code written since the last remediation round**
   for the specific anti-pattern (re-deriving instead of reading canonical) —
   this is worth doing as its own bounded audit before Claude Code starts
   heavy report work, since it's the single most recurring defect class in
   KINGA's history.
3. **"Provides value" is a separate question from "is consistent."**
   Consistency is a correctness bar; value is a product bar — worth
   explicitly defining what makes a report valuable to an insurer/assessor
   reading it (clarity of the fraud reasoning, actionable next steps,
   defensible physics evidence) as its own spec, likely informed by real
   feedback from whoever actually reads these reports today, before treating
   it as an engineering task.
4. **Physics calibration constants (N-03 markers)** were flagged in past
   work as needing validation against KINGA's own Zimbabwe/Zambia claim
   corpus rather than imported NHTSA data — this directly affects report
   credibility/value and connects to the deformation calibration spec in
   Section 1. Worth sequencing together.

---

## 8. Costing Tiers

**Current state, per past work:** tiers were finalized as Process
($900 + $12/claim), Protect ($1,300 + $12/claim), Prove ($1,800 + $12/claim),
with Forensic Reports excluded at Process except via a ~$120 buy-up, and a
go-to-market gate of 50 test claims or 30 days full access before tier
gating activates. AI cost baseline was corrected to ~$0.052/claim (all-Flash)
rising to ~$0.16–0.19/claim on Deep tier.

**To-do:**
1. **Confirm the tier-gating logic is actually implemented and enforced**
   in code, not just decided in planning — this is a common gap between
   "the pricing model is finalized" and "the system actually gates features
   by tier." Worth an explicit audit pass, same pattern as everything else
   in this document: don't assume, verify against running code.
2. **Confirm the $12/claim cost-recovery fee and AI cost baseline are still
   accurate** given any model/pricing changes since that estimate was made —
   AI provider pricing shifts, and a stale cost baseline could mean the
   tiers are no longer priced correctly relative to actual cost.
3. **Portfolio analytics as the anti-downgrade-arbitrage moat** — confirm
   this is actually built and tier-gated, not just a stated intention.
4. **Decide whether costing/tier logic needs its own regression test**
   (e.g. "a Process-tier account cannot access Forensic Reports without the
   buy-up flag set") — same reasoning as Section 7.1: turn a business rule
   into an enforced test rather than a hopeful convention.

---

## 6. Definition of "Ready to Kick Off Claude Code"

- Items 1–3 in Section 5 are done (schema is clean, environment is
  documented, a fresh clone can get a working local DB in minutes not hours).
- `CLAUDE.md` is written and committed to the repo root.
- This document's Section 1 spec is either implemented or explicitly queued
  as the first task to hand Claude Code, with items 4 and 5 already decided
  so it isn't blocked on open product questions on day one.
