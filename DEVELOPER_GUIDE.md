# KINGA AutoVerify AI — Developer Guide

**Version:** 1.0 | **Author:** Tavonga Shoko, Lead Engineer | **Last Updated:** August 2026

This guide is for engineers joining the KINGA platform. It covers the development environment, architecture conventions, how to add features, how to run tests, and the most important rules to follow.

Read `CODEBASE_MAP.md` alongside this guide for the file-by-file reference.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture in One Page](#architecture-in-one-page)
3. [How to Add a Feature](#how-to-add-a-feature)
4. [How to Add a tRPC Procedure](#how-to-add-a-trpc-procedure)
5. [How to Add a DB Table](#how-to-add-a-db-table)
6. [How to Add a Portal Page](#how-to-add-a-portal-page)
7. [How to Run Tests](#how-to-run-tests)
8. [Platform Governance Rules](#platform-governance-rules)
9. [Role and Permission System](#role-and-permission-system)
10. [Tenant Isolation](#tenant-isolation)
11. [The AI Pipeline](#the-ai-pipeline)
12. [Report System](#report-system)
13. [Cost Intelligence](#cost-intelligence)
14. [WhatsApp Integration](#whatsapp-integration)
15. [Scheduled Jobs](#scheduled-jobs)
16. [Known Technical Debt](#known-technical-debt)
17. [Common Mistakes](#common-mistakes)
18. [Deployment](#deployment)

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Push DB schema changes
pnpm db:push

# Start dev server (Express + Vite on port 3000)
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

The dev server runs on `http://localhost:3000`. The React app is served by Vite through the Express proxy in development.

---

## Architecture in One Page

KINGA is a **portals-over-shared-engines** platform. The key principle is that intelligence belongs to the platform, not to any individual portal.

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT PORTALS (React, lazy-loaded per portal domain)      │
│  My Portal · Insurer · Assessor · Panel Beater · Fleet      │
│  Agency · Engineer · Platform Admin                         │
└──────────────────────────┬──────────────────────────────────┘
                           │ tRPC (type-safe RPC)
┌──────────────────────────▼──────────────────────────────────┐
│  tRPC ROUTERS (server/routers.ts aggregator)                │
│  claims-core · ai-assessments-core · quotes-core            │
│  auth-core · assessors-core · 70+ domain routers            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  SHARED INTELLIGENCE PLATFORM                               │
│  Physics · Fraud · Valuation · Photo Forensics              │
│  Cost Optimisation · CGI · Interpretation                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  DATABASE (TiDB/MySQL via Drizzle ORM)                      │
│  schema: drizzle/schema.ts · helpers: server/db.ts          │
└─────────────────────────────────────────────────────────────┘
```

**The rule:** Portals orchestrate intelligence. They do not own it.

---

## How to Add a Feature

Follow this checklist for every new feature:

1. **Check if it already exists.** Read `CODEBASE_MAP.md`. Check `server/routers/` and `client/src/components/`. Many capabilities are already built but not connected to navigation.
2. **Identify the correct domain.** Claims? Use `claims-core.ts`. Quotes? Use `quotes-core.ts`. New domain? Create a new router file in `server/routers/`.
3. **Schema first.** If you need a new DB table or column, add it to `drizzle/schema.ts` and run `pnpm db:push`.
4. **DB helper in `server/db.ts`.** Add query helpers for the new table. Never write raw queries in router files.
5. **tRPC procedure.** Add the procedure to the correct router file. Use `protectedProcedure` for authenticated access, `insurerDomainProcedure` for insurer-scoped access.
6. **Client page or component.** Create or update the UI. Register the route in `App.tsx` if it is a new page.
7. **Write a test.** Add a Vitest test in `server/*.test.ts`. Cover the happy path and the error path.
8. **Run the full build.** `pnpm build` must pass with zero errors before committing.
9. **Checkpoint.** Save a checkpoint before deploying.

---

## How to Add a tRPC Procedure

```typescript
// In the correct domain router file, e.g. server/routers/claims-core.ts

myNewProcedure: protectedProcedure
  .input(z.object({
    claimId: z.number().int().positive(),
    note: z.string().min(1).max(1000),
  }))
  .mutation(async ({ ctx, input }) => {
    if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

    // Use DB helpers from server/db.ts — never write raw SQL here
    const claim = await getClaimById(input.claimId, ctx.user.tenantId);
    if (!claim) throw new TRPCError({ code: "NOT_FOUND" });

    // Write audit entry for every mutation
    await createAuditEntry({
      claimId: input.claimId,
      userId: ctx.user.id,
      action: "my_new_action",
      entityType: "claim",
      changeDescription: `Note added: ${input.note.substring(0, 50)}`,
    });

    return { success: true };
  }),
```

**For insurer-scoped procedures** (must enforce tenant isolation):

```typescript
// Use insurerDomainProcedure — it injects ctx.insurerTenantId
myInsurerProcedure: insurerDomainProcedure
  .input(z.object({ claimId: z.number() }))
  .query(async ({ ctx, input }) => {
    const tenantId = ctx.insurerTenantId; // Always use this, never ctx.user.tenantId
    return getClaimById(input.claimId, tenantId);
  }),
```

**Consuming in the client:**

```typescript
// Query
const { data, isLoading } = trpc.claims.myNewProcedure.useQuery({ claimId: 123 });

// Mutation
const mutation = trpc.claims.myNewProcedure.useMutation({
  onSuccess: () => {
    utils.claims.invalidate(); // Invalidate related queries
  },
});
mutation.mutate({ claimId: 123, note: "Approved" });
```

---

## How to Add a DB Table

1. Add the table definition to `drizzle/schema.ts`:

```typescript
export const myNewTable = mysqlTable("my_new_table", {
  id: int("id").primaryKey().autoincrement(),
  claimId: int("claim_id").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }).notNull(),
  data: text("data"),
  createdAt: varchar("created_at", { length: 50 }).notNull(),
});

export type MyNewRow = typeof myNewTable.$inferSelect;
export type InsertMyNew = typeof myNewTable.$inferInsert;
```

2. Push the schema: `pnpm db:push`

3. Add query helpers in `server/db.ts`:

```typescript
export async function createMyNew(data: InsertMyNew): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.insert(myNewTable).values(data);
}

export async function getMyNewByClaimId(claimId: number, tenantId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(myNewTable)
    .where(and(eq(myNewTable.claimId, claimId), eq(myNewTable.tenantId, tenantId)));
  return rows[0] ?? null;
}
```

> **Always include `tenantId` in every table that stores business data.** This is non-negotiable for tenant isolation.

---

## How to Add a Portal Page

1. Create the page component in `client/src/pages/MyNewPage.tsx`.
2. Add a lazy import in `App.tsx` **before** the `Router` function:

```typescript
const MyNewPage = lazy(() => import("./pages/MyNewPage"));
```

3. Register the route inside the `Router` function:

```typescript
<Route path="/my-new-path" component={() => (
  <Suspense fallback={<DashboardLayoutSkeleton />}>
    <ProtectedRoute domain="insurer">
      <MyNewPage />
    </ProtectedRoute>
  </Suspense>
)} />
```

> **Critical:** The lazy import declaration MUST come before the `Router` function in `App.tsx`. If it is declared after, React will receive `undefined` as the component and throw error #130 at runtime. This was a bug that affected 13 pages in August 2026.

---

## How to Run Tests

```bash
# Run all tests
pnpm test

# Run a specific test file
pnpm exec vitest run server/pipeline-v2/buildCompositeQuote.test.ts

# Run tests in watch mode
pnpm exec vitest
```

**Test files are co-located with the code they test:**
- `server/pipeline-v2/buildCompositeQuote.test.ts` — quote optimisation engine
- `server/db-pipeline.test.ts` — pipeline observability helpers
- `server/routers/analytics.test.ts` — analytics router
- `server/routers/workflow-queries.test.ts` — workflow queries (tenant isolation)
- `server/pipeline-v2/photoForensicsEngine.test.ts` — photo forensics
- `server/pipeline-v2/physicsNumericalContract.test.ts` — physics engine contracts

**Known flaky tests** (tracked as KINGA-TEST-STABILITY-01):
- `truthReconciliationEngine.test.ts` — fails under memory pressure, passes in isolation
- `e2e-real-claim.test.ts` — fails under full-suite load

These are not regressions — they are pre-existing stability issues. Do not block deploys on them.

---

## Platform Governance Rules

These rules are non-negotiable. Every engineer must follow them.

| # | Rule |
|---|---|
| 1 | **Intelligence belongs to the platform.** Never build a portal-specific engine. Reuse existing shared engines. |
| 2 | **No duplicate engines.** Before building any new service, check `CODEBASE_MAP.md` and the Service Registry. |
| 3 | **The gate never blocks.** The intake gate warns and notifies — it never prevents an assessment from running. |
| 4 | **No email spam.** Automated pipeline events use in-app notifications only. Email is for agent-initiated actions. |
| 5 | **Tenant isolation is mandatory.** Every insurer-scoped procedure must use `insurerDomainProcedure`. |
| 6 | **Audit every mutation.** Every state-changing procedure must call `createAuditEntry()`. |
| 7 | **Physics engine is immutable.** Do not modify `accidentPhysics.ts` without a formal Architecture Review. |
| 8 | **AI is advisory.** AI outputs inform human decisions — they do not make them. |
| 9 | **Every new table needs a justification.** Before adding a table, confirm it does not duplicate an existing one. |
| 10 | **Every Epic requires an Architecture Review before implementation.** |
| 11 | **KINGA branding everywhere.** Use "KINGA" not "AI Intelligence" in all user-facing text. |
| 12 | **Checkpoint before deploying.** Always save a checkpoint before clicking Publish. |

---

## Role and Permission System

Roles are defined in `shared/role-permissions.ts`. The `DOMAIN_ROLE_MAP` maps roles to portal domains.

| Role | Portal Domain | Key Access |
|---|---|---|
| `claimant` | client | My Portal — submit claims, view own claims |
| `claims_processor` | insurer | Claims processing, assessment trigger |
| `assessor_internal` | insurer | Internal assessment, report access |
| `claims_manager` | insurer | Claims manager dashboard, approval authority |
| `risk_manager` | insurer | Risk analytics, portfolio intelligence |
| `executive` | insurer | Executive dashboard, portfolio analytics |
| `insurer_admin` | insurer | Tenant administration |
| `assessor` | assessor | External assessor portal |
| `panel_beater` | panel_beater | Panel beater portal, quote submission |
| `fleet_manager` | fleet | Fleet management portal |
| `fleet_admin` | fleet | Fleet administration |
| `agency_broker` | agency | Agency service portal |
| `agency_admin` | agency | Agency administration |
| `engineer` | engineer | Engineering portal |
| `platform_super_admin` | admin | Platform admin — all portals, all tenants |

**Adding a new role:**
1. Add the role to the `users.role` enum in `drizzle/schema.ts`.
2. Run `pnpm db:push`.
3. Add the role to `DOMAIN_ROLE_MAP` in `shared/role-permissions.ts`.
4. Add the role to `ROLE_PORTAL_MAP` in `server/routers/auth-core.ts`.
5. Update `getDashboardPath()` in `client/src/pages/Login.tsx`.

---

## Tenant Isolation

Every insurer is a separate tenant. Tenant isolation is enforced at three levels:

1. **Middleware:** `_core/tenant-middleware.ts` injects `tenantId` from the JWT.
2. **Procedure:** `insurerDomainProcedure` validates and injects `ctx.insurerTenantId`.
3. **Query:** Every DB query for insurer data must filter by `tenantId`.

**Violations are logged** to `tenant_isolation_violations` table and monitored by the Platform Admin portal.

**Never use `ctx.user.tenantId` directly in insurer procedures.** Always use `ctx.insurerTenantId` from `insurerDomainProcedure`.

---

## The AI Pipeline

The pipeline runs in `server/db.ts` via `triggerAiAssessment(claimId)`. It is protected by a concurrency semaphore (`MAX_CONCURRENT_PIPELINES = 1`).

**Pipeline stages:**

| Stage | File | Output |
|---|---|---|
| 1 — Ingestion | `stage-1-ingestion.ts` | Raw document text, OCR output |
| 2 — Extraction | `stage-2-extraction.ts` | Extracted fields |
| 3 — Structured | `stage-3-structured-extraction.ts` | Structured claim record |
| 4 — Validation | `stage-4-validation.ts` | Validation flags |
| 5 — Assembly | `stage-5-assembly.ts` | Assembled claim record |
| 6 — Damage | `stage-6-damage-analysis.ts` | Damage components, zones |
| 6.5 — VGE/VGR | `stage-6-5a/b/c.ts` | Vehicle geometry |
| 7 — Physics | `stage-7-physics.ts` | Speed, force, impulse |
| 8 — Fraud | `stage-8-fraud.ts` | Fraud score, signals |
| 9 — Cost | `stage-9-cost.ts` | Quote extraction, composite optimisation |
| 9.5 — CGI | `stage-9-5-cgi.ts` | Crash geometry intelligence |
| 10 — Report | `stage-10-report.ts` | Report generation trigger |
| 10i — Interpret | `stage-10i-interpretation.ts` | Plain-language interpretation |

**Resume support:** If the pipeline is interrupted, `loadCompletedStages()` from `db-pipeline.ts` allows it to skip already-completed stages on restart.

**Gate policy:** The gate (`pipelineGateController.ts`) checks quality conditions but **never blocks** the pipeline. It warns and notifies only.

---

## Report System

Three report tiers are generated for every claim:

| Tier | File | Audience | Content |
|---|---|---|---|
| CL — Claims Assessment | `reporting/reportDefinitions.ts` | Claimant, Assessor | Process summary, damage, costs, timeline |
| CI — Claims Intelligence | `reporting/claimsIntelligenceReport.ts` | Insurer | Analytics, CGI, vehicle history, fraud |
| FR — Forensic Decision | `reporting/forensicDecisionReport.ts` | Senior management | Legal-grade audit, physics, fraud breakdown |

**Cost field naming (critical):**
- KINGA Optimised = `costIntelligenceJson.compositeOptimisation.l2CompositeOptimisedCostUsd`
- Lowest submitted quote = `costIntelligenceJson.documentedAgreedCostUsd`
- Original quote = `costIntelligenceJson.documentedOriginalQuoteUsd`

> **Do not use `compositeOptimisedCostUsd`** — this field does not exist in DB data. The correct field is `l2CompositeOptimisedCostUsd`.

---

## Cost Intelligence

The cost optimisation engine (`pipeline-v2/quoteOptimisationEngine.ts`) selects the best price per component across all submitted quotes.

**Pricing tiers:**
- **T1 — Benchmark P50:** Use when benchmark data exists and submitted price is within 15% of P50.
- **T2 — Adjusted benchmark:** Use when submitted price exceeds P50 by 15–30%.
- **T3 — Lowest submitted:** Use when no benchmark exists or deviation exceeds 30%.
- **T4 — Unpriced:** Component not in any quote — flagged as unpriced.

**Minimum floor rule:** When benchmark fills are present, the KINGA Optimised total cannot fall below the lowest submitted total.

**Benchmark learning:** After every assessment, selected prices are written back to `component_repair_outcomes` via `insertCostLearningRecord()`. This grows the benchmark database with each claim.

**Paint, sundries, and labour** are included in the composite (fixed in Aug 2026 — previously excluded due to `isNonPartCost` flag over-filtering).

---

## WhatsApp Integration

The WhatsApp engine is in `server/whatsapp/`. It is provider-agnostic.

**Current state:** `MockWhatsAppAdapter` is active. No live Twilio traffic.

**To activate Twilio:**
1. Add secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`.
2. Change `MockWhatsAppAdapter` to `TwilioAdapter` in `whatsapp/engine.ts`.
3. Register the webhook URL in Twilio: `https://your-domain/api/whatsapp/webhook`.

**Supported insurers (for claim submission):**
Old Mutual, Cell Insurance, Zimnat, NICOZ Diamond, Allied Insurance, Alliance.

**Claim journey:** Hi → Confirm accident → Select insurer → Driver details → Licence → Incident type → Description → Road surface → Weather → GPS location → 4 photos → Submit.

---

## Scheduled Jobs

Two scheduled jobs run via the Heartbeat SDK:

| Job | Handler | Trigger | Purpose |
|---|---|---|---|
| Intake Escalation | `/api/scheduled/intake-escalation` | Every 30 min | Escalates claims stuck in intake >2 hours |
| Stuck Recovery | `/api/scheduled/stuck-recovery` | Every 15 min | Recovers assessments stuck mid-pipeline |

**Post-deploy runbook (must run after every deployment):**
1. `manus-heartbeat create --name intake-escalation --url /api/scheduled/intake-escalation --cron "*/30 * * * *"`
2. `manus-heartbeat create --name stuck-recovery --url /api/scheduled/stuck-recovery --cron "*/15 * * * *"`
3. Set `HEARTBEAT_ALLOWED_TASK_UIDS` to the two returned UIDs.
4. Verify both crons fire by checking server logs for `[Heartbeat]` entries.

**Auth:** Heartbeat callers are authenticated via JWT signature + `isCron` discriminator + taskUid allowlist. A startup log line warns if `HEARTBEAT_ALLOWED_TASK_UIDS` is not set.

---

## Known Technical Debt

These items are tracked in `todo.md` and should be addressed before the platform scales beyond the first pilot insurer.

| ID | Item | Risk | Priority |
|---|---|---|---|
| SPLIT-DB-01 | `server/db.ts` (4,883 lines) needs domain split | Maintainability | Medium |
| SPLIT-ORC-01 | `pipeline-v2/orchestrator.ts` (3,430 lines) needs stage-group split | Maintainability | Medium |
| SPLIT-RPT-01 | `reporting/reportDefinitions.ts` (2,924 lines) needs section split | Maintainability | Medium |
| KINGA-SEARCH-01 | TiDB does not support FULLTEXT on `utf8mb4_bin` — substring LIKE `%query%` used instead | Performance at >10k claims | Low (monitor) |
| KINGA-TEST-STABILITY-01 | `truthReconciliationEngine.test.ts` and `e2e-real-claim.test.ts` flaky under load | Test reliability | Medium |
| TS-ERRORS-01 | 126 pre-existing TypeScript errors in WhatsApp module (null-check issues) | Runtime safety | High (fix before Twilio activation) |

---

## Common Mistakes

**1. Lazy import declared after the Router function**
This causes React error #130 at runtime. All `const X = lazy(() => import(...))` declarations must be before `function Router()` in `App.tsx`.

**2. Using `ctx.user.tenantId` in insurer procedures**
Use `ctx.insurerTenantId` from `insurerDomainProcedure` instead. `ctx.user.tenantId` may be null for some user types.

**3. Reading `compositeOptimisedCostUsd` from costIntelligenceJson**
This field does not exist. The correct field is `l2CompositeOptimisedCostUsd`.

**4. Adding a new engine instead of reusing an existing one**
Check `CODEBASE_MAP.md` first. The platform has engines for physics, fraud, valuation, photo forensics, cost optimisation, CGI, and interpretation. Do not duplicate them.

**5. Blocking the pipeline gate**
The gate must never return an error that stops the pipeline. It warns, logs, and notifies — but always allows the pipeline to proceed.

**6. Storing file bytes in the database**
Use S3 via `storagePut()` in `server/storage.ts`. Store only the S3 URL and key in the database.

**7. Hardcoding the server port**
Never hardcode port numbers. Use `process.env.PORT` or let the framework assign the port.

**8. Not writing an audit entry for mutations**
Every state-changing procedure must call `createAuditEntry()`. This is required for governance compliance.

---

## Deployment

1. Run `pnpm build` — must pass with zero errors.
2. Run `pnpm test` — must pass (flaky tests noted above may be skipped with justification).
3. Save a checkpoint: use the Manus UI checkpoint button or `webdev_save_checkpoint`.
4. Click **Publish** in the Manus Management UI.
5. Run the post-deploy Heartbeat runbook (see Scheduled Jobs section).
6. Verify both crons fire by checking server logs.
7. Test the login flow for at least one role per portal.

**Custom domain:** `kingaai-ybs42lwg.manus.space`

**GitHub:** All code is synced to GitHub via the Manus checkpoint system. Every checkpoint is a git commit on the `main` branch.
