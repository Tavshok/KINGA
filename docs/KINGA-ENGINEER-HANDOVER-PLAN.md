# KINGA — Engineer Handover Plan

Purpose: prepare KINGA for handover to two engineers who will develop and
maintain it going forward. Covers (1) coding standards so the codebase is
genuinely maintainable by people who didn't build it, and (2) how work
splits between two engineers, day to day and week to week.

---

## Part 1 — Coding Standards for Handover-Readiness

The goal isn't "clever" or "impressive" code — it's code a new engineer can
read once and trust. Concretely:

### 1.1 Function and file size
- Prefer many small, named functions over few large ones. A function that
  needs a comment explaining "step 1, step 2, step 3" inside it should
  usually be three functions instead.
- No file should require scrolling past ~400-500 lines to understand its
  purpose. If a router or service file is growing past that, it's a signal
  to split it by responsibility (already the pattern in `server/routers/` —
  keep following it as files grow, e.g. `inspections-core.ts` /
  `inspections-measurements.ts` rather than one giant file).

### 1.2 Comments — explain *why*, not *what*
- Code should be readable enough that *what* it does is obvious from names
  and structure. Comments earn their place explaining *why* — a business
  rule, a non-obvious constraint, a historical gotcha (the `KINGA-N-03
  CALIBRATION` comment style already used in `accidentPhysics.ts` is the
  right model — state the basis, flag if unvalidated, say what would need
  to change to revisit it).
- Every non-obvious magic number or threshold gets a named constant with a
  comment citing its source, exactly like the calibration tolerance
  decided tonight. No bare numbers in business logic.

### 1.3 Naming
- Match the database column name to the TypeScript property name wherever
  Drizzle allows it (snake_case DB, camelCase property, standard mapping) —
  tonight's `claimId`/`claim_id` bug happened specifically because a
  property didn't follow this convention. Audit for this pattern
  periodically, not just once.
- No abbreviations that aren't immediately obvious. `tenantId`, not `tId`.

### 1.4 Tenant-authority pattern — non-negotiable, always the same shape
- Every procedure touching tenant-scoped data: explicit `if (!tenantId)
  throw FORBIDDEN` at the top, tenant predicate on every query, never trust
  caller-supplied tenant input. This is now proven out in
  `inspections.ts` and `notifications.ts` — use one of those two files as
  the literal template for any new router, don't reinvent the pattern.

### 1.5 Tests as documentation
- A new engineer should be able to read the test file for a router and
  understand what it's supposed to do, including what it's supposed to
  *refuse* to do. The `inspectionAuthority.p0.test.ts` /
  `notificationsTenantAuthority.p0.test.ts` style — named, readable test
  descriptions, real fixtures, real assertions — is the standard going
  forward, not an exception.
- Every new feature gets at least one test that would fail if the feature
  were removed. No PR merges without this.

### 1.6 One canonical source of truth per concept
- Report generators, cost calculations, and physics outputs must read from
  the canonical resolver layer (`resolveClaimRecord()`, etc.), never
  re-derive independently. This was the single most recurring defect class
  in KINGA's history — treat any new code that queries `claims` or
  `ai_assessments` directly, outside the canonical layer, as a code-review
  blocker, not a style nitpick.

### 1.7 Documentation that travels with the code
- Every non-trivial module gets a short header comment: what it's for, what
  calls it, what it must never do (e.g. "never bypass tenant scoping,"
  "never treat this as authoritative pricing"). This is cheap insurance
  against the exact kind of drift found tonight (raw SQL bypassing Drizzle
  with no one aware it existed).
- Keep `docs/KINGA-CLAUDE-CODE-READINESS.md` (or its successor, once
  `CLAUDE.md` is written) as the living standing-context document. Update
  it, don't let it go stale — a wrong "punch list" is worse than none.

---

## Part 2 — Splitting Work Between Two Engineers

### 2.1 Recommended split: by layer, not by feature

Splitting by feature (Engineer A does inspections, Engineer B does claims)
sounds natural but tends to duplicate the tenant-authority/canonical-layer
mistakes across both people's code independently, since each person
reinvents the same pattern in isolation. Splitting by **layer** keeps one
person owning correctness of the shared foundation, which is where KINGA's
worst historical bugs have lived.

**Engineer 1 — Platform & Data Integrity**
- Owns: `drizzle/schema.ts`, migrations, the canonical resolver layer
  (`resolveClaimRecord`, `normaliseReportData`), tenant-authority patterns
  and their shared helpers (`p0TenantBoundary.ts`, `trpc.ts` context),
  database ownership/staging/production infrastructure, CI/build health.
- This person is the one who reviews *any* PR touching schema, auth, or
  canonical data access, regardless of who wrote it — they're the gate on
  the class of bug that's caused the most damage historically.

**Engineer 2 — Product & Feature Surface**
- Owns: individual routers/portals built on top of the platform layer
  (inspections, claims workflow, reporting content, cost-tier logic, the
  deformation calibration feature), UI/portal work, most day-to-day feature
  requests.
- Consumes the platform layer Engineer 1 owns — never modifies shared
  tenant-authority helpers or the schema directly without Engineer 1's
  review, even if it would be faster to just do it themselves.

This mirrors the actual shape of tonight's work: the P0 notification fix
and the CI type-gap fix were both "shared foundation" work (Engineer 1
territory); the deformation calibration design and report-consistency work
are "feature surface" (Engineer 2 territory).

### 2.2 Daily rhythm

**Both engineers, every day:**
- Start by pulling `main`, confirming a clean build and passing tests
  locally before starting new work — the same discipline used all through
  tonight's session (verify before building on top of something).
- Any PR that touches tenant scoping, schema, or the canonical data layer
  gets Engineer 1's review before merge, no exceptions, even for
  "trivial" changes — this is exactly the review boundary tonight's
  process modeled.
- End of day: push work-in-progress to a branch even if incomplete (never
  leave a day's work only on a local machine) and leave a short note on
  what's done/blocked, so the other engineer isn't blind to context the
  next morning.

**Engineer 1, specific daily focus (early on, until infra is settled):**
- Days 1-3ish: TiDB Cloud ownership setup, staging environment creation —
  this blocks a lot of Engineer 2's later work (can't safely test schema
  changes without staging), so it should be front-loaded.
- Ongoing: monitor CI health, review schema/auth PRs, own the migration
  remediation plan execution (Steps 0-5 from tonight's approved plan).

**Engineer 2, specific daily focus:**
- Can start immediately on the deformation calibration implementation and
  report-consistency test work — neither depends on the TiDB move.
- Cost-tier gating verification and the ~15 "incompatible design
  divergence" schema items (Section 4.2 of tonight's classification
  report) — these need product judgment as much as code, so loop you in
  for the ambiguous ones rather than guessing.

### 2.3 Weekly rhythm

- **One weekly sync between the two engineers and you** — review what
  merged, what's blocked, and re-prioritize the punch list. Keep it short;
  the goal is catching drift early, not a status theater meeting.
- **One weekly "read the whole diff" session** where each engineer reviews
  a meaningful chunk of the *other's* recent work, not just rubber-stamp
  PRs — this is how tonight's session caught real bugs (test isolation
  flaws, overclaimed evidence) that a rushed review would have missed.

### 2.4 What neither engineer should do without your explicit sign-off

- Any production database schema change, migration execution, or data
  migration.
- Any change to authentication/authorization architecture.
- Any change to the cost-tier / pricing logic that affects billing.
- Deleting or "retiring" any database table or field classified as
  "retained legacy" in tonight's classification report, without the
  controlled verification that report specifies.

### 2.5 Onboarding sequence for both engineers, day one

1. Read `docs/KINGA-CLAUDE-CODE-READINESS.md` (or its `CLAUDE.md`
   successor) in full.
2. Read `docs/SCHEMA_MIGRATION_DRIFT_AUDIT.md` and
   `docs/SCHEMA_MIGRATION_REMEDIATION_PLAN.md` — this is the most
   important context on what state the database is actually in.
3. Get a local dev environment running end to end using `.env.example` and
   the Docker-based test database setup pattern from tonight — this alone
   should take under an hour now that the setup is documented, versus the
   multi-hour discovery process it took tonight.
4. Read `server/routers/inspections.ts` and
   `server/engineer/inspectionAuthority.p0.test.ts` together as the
   reference implementation for the tenant-authority pattern — this is the
   template for all future router work.
5. Make one small, real, reviewed PR before touching anything consequential
   — same as the "test the pattern on something bounded first" approach
   used throughout tonight.
