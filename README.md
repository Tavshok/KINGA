# KINGA — AutoVerify AI

KINGA is an AI-powered motor insurance claims verification platform. It ingests claim documents (PDFs, photos, police reports, repair quotes), runs them through a 10-stage forensic pipeline, and produces a structured fraud risk assessment, physics-validated damage analysis, and cost-optimised repair recommendation.

---

## Quick Start (Local Development)

**Prerequisites:** Node.js 22+, pnpm, a MySQL-compatible database (TiDB Cloud recommended).

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables (see .env.example or the Manus Secrets panel)
# Required: DATABASE_URL, JWT_SECRET, BUILT_IN_FORGE_API_KEY, BUILT_IN_FORGE_API_URL

# 3. Push the database schema
pnpm db:push

# 4. Start the development server
pnpm dev
# → Frontend: http://localhost:5173
# → Backend API: http://localhost:3000/api/trpc
```

**Other useful commands:**

| Command | Purpose |
|---|---|
| `pnpm test` | Run all Vitest unit tests |
| `pnpm check` | TypeScript type-check (full project) |
| `pnpm check:server` | TypeScript type-check (server only) |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Apply schema changes to the database |
| `pnpm build` | Production build |

---

## Project Structure

```
kinga-replit/
├── client/                   Frontend (React 19 + Tailwind 4 + shadcn/ui)
│   └── src/
│       ├── pages/            91 page-level components (one per route)
│       ├── components/       Reusable UI components
│       └── App.tsx           Route definitions
│
├── server/                   Backend (Express 4 + tRPC 11)
│   ├── pipeline-v2/          The 10-stage AI forensic pipeline (176 files)
│   ├── routers/              69 tRPC sub-routers (one per feature domain)
│   ├── services/             Shared business logic services
│   ├── db.ts                 All database query helpers
│   ├── routers.ts            tRPC router barrel (imports all sub-routers)
│   ├── driver-registry.ts    Driver master record upsert
│   ├── vehicle-registry.ts   Vehicle master record upsert
│   ├── cross-claim-intelligence.ts  9-signal collusion detector
│   └── _core/                Framework plumbing (OAuth, LLM, env — do not edit)
│
├── drizzle/
│   └── schema.ts             Single source of truth for all database tables
│
├── shared/                   Constants and types shared between client and server
├── CHANGELOG.md              All significant changes with rationale and file references
└── todo.md                   Active feature backlog and bug tracker
```

---

## The AI Pipeline

Every claim flows through a 10-stage pipeline defined in `server/pipeline-v2/`. Each stage is a self-contained TypeScript file. The pipeline **never halts** — if a stage fails, it degrades gracefully and the next stage runs with whatever data is available.

| Stage | File | What it does |
|---|---|---|
| 1 | `stage-1-ingestion.ts` | Document ingestion — fetches PDFs and photos, validates file types |
| 2 | `stage-2-extraction.ts` | OCR and text extraction — converts documents to raw text |
| 3 | `stage-3-structured-extraction.ts` | Structured data extraction — LLM parses text into typed claim fields |
| 4 | `stage-4-validation.ts` | Data validation and vehicle data recovery |
| 5 | `stage-5-assembly.ts` | Claim data assembly — merges all extracted fields into `ClaimRecord` |
| 6 | `stage-6-damage-analysis.ts` | Damage analysis — vision model identifies damaged components |
| 7 | `stage-7-physics.ts` | Physics analysis — validates damage against collision mechanics |
| 8 | `stage-8-fraud.ts` | Fraud analysis — scores 40+ fraud indicators |
| 9 | `stage-9-cost.ts` | Cost optimisation — benchmarks repair quotes against market rates |
| 10 | `stage-10-report.ts` | Report generation — produces the structured forensic report |

**Entry point:** `server/pipeline-v2/orchestrator.ts` — `runPipelineV2()` calls all stages in sequence.

**Core types:** `server/pipeline-v2/types.ts` — `ClaimRecord` is the central data structure passed between stages. Read this file first when joining the project.

**Architecture docs:**
- `server/pipeline-v2/CLAIM_TRUTH_LAYER.md` — explains the data flow and truth-layer design
- `server/pipeline-v2/INCIDENT_TYPE_TAXONOMY.md` — the canonical incident classification system

---

## Post-Pipeline Intelligence (Auto-Enrichment)

After every pipeline run, three background tasks fire automatically (non-blocking, never delay the response):

1. **Entity Registry** (`server/services/entityRegistry.ts`) — upserts drivers, claimants, assessors, panel beaters, and police officers into their respective master tables. Writes relationship graph edges between entities.

2. **Vehicle Registry** (`server/vehicle-registry.ts`) — upserts the vehicle into `vehicle_registry`. Enables repeat-damage detection and vehicle risk scoring across claims.

3. **Cross-Claim Intelligence** (`server/cross-claim-intelligence.ts`) — runs 9 collusion signal detectors (repeat damage, repairer-driver co-occurrence, claimant address rings, etc.) and writes detected signals to `cross_claim_signals`. Runs 3 seconds after the pipeline to allow registry writes to commit first.

> **Important:** Absence from the registry is not fraud. All new entities start at risk tier A (neutral). Risk only degrades when positive evidence accumulates.

---

## Database

Schema is defined in `drizzle/schema.ts` — this is the single source of truth for all tables.

**To add a new table or column:**
1. Edit `drizzle/schema.ts`
2. Run `pnpm db:push`
3. Add query helpers to `server/db.ts`

**Key tables:**

| Table | Purpose |
|---|---|
| `claims` | Central claims table — all claim fields and pipeline status |
| `ai_assessments` | Pipeline output — fraud scores, damage analysis, report JSON |
| `panel_beaters` | Repairer master records |
| `vehicle_registry` | Vehicle master records (cross-claim) |
| `drivers` | Driver master records |
| `entity_relationships` | Graph edges between any two entities |
| `cross_claim_signals` | Detected collusion signals per claim |
| `audit_trail` | Immutable audit log for all claim state changes |
| `tenants` | Multi-tenant insurer configuration |

---

## Adding a New Feature

Follow this checklist for every new feature. This is the standard that keeps the codebase maintainable:

1. **Schema first** — add or modify tables in `drizzle/schema.ts`, then `pnpm db:push`
2. **Query helper** — add a typed function to `server/db.ts` (or a new `server/db-{feature}.ts` if the feature is large)
3. **tRPC procedure** — add a procedure to `server/routers/{feature}.ts` (create the file if it does not exist); import it in `server/routers.ts`
4. **Frontend** — create `client/src/pages/{Feature}.tsx`; register the route in `client/src/App.tsx`
5. **Tests** — add a `server/{feature}.test.ts` with at least the happy path and one error path
6. **Todo** — mark the item as `[x]` in `todo.md`
7. **Changelog** — add an entry to `CHANGELOG.md` with: what changed, why, which files, checkpoint version

**Code standards for all new code:**
- No `@ts-nocheck` — fix the types instead
- No `as any` unless wrapping a third-party library with no types
- Every exported function must have a JSDoc comment explaining what it does and what it returns
- Every pipeline stage file must open with a module-level comment block (see existing stages as examples)
- All numeric thresholds must have a comment explaining their source (e.g., engineering literature, expert knowledge, empirical observation)
- All background tasks must be fire-and-forget with `setImmediate` or `setTimeout`, wrapped in try/catch, and must never throw

---

## Authentication

KINGA uses Manus OAuth. The flow is:
1. Frontend calls `getLoginUrl()` from `client/src/const.ts` — this encodes the current origin in the OAuth state
2. After login, `/api/oauth/callback` handles the redirect and sets a session cookie
3. Every tRPC request builds context via `server/_core/context.ts` — `ctx.user` is the authenticated user
4. Use `protectedProcedure` for any endpoint that requires login; `publicProcedure` for public endpoints

---

## Multi-Tenancy

KINGA is multi-tenant. Every claim, user, and configuration record has a `tenantId` field. The `tenantId` maps to a row in the `tenants` table which holds insurer-specific configuration (rates, thresholds, branding).

Always pass `tenantId` to query helpers. Never query claims without a tenant filter unless you are explicitly building a cross-tenant admin feature.

---

## Environment Variables

All secrets are managed through the Manus Secrets panel. Do not commit `.env` files.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing key |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side LLM, storage, etc.) |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API base URL |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL (frontend) |
| `GOOGLE_AI_API_KEY` | Google AI (Gemini) API key for vision tasks |

See `server/_core/env.ts` for the full list of available environment variables in server code.

---

## Key Decisions and Rationale

See `CHANGELOG.md` for a full history of significant decisions. Key architectural decisions:

- **Pipeline never halts** — every stage is wrapped in try/catch; degraded output is always better than no output for a claims adjuster
- **`@ts-nocheck` is banned in new code** — it hides bugs; fix the types instead
- **No hardcoded fraud thresholds without a comment** — every numeric value in the fraud engine must cite its source
- **Entity registry is non-blocking** — it must never delay the pipeline response; use `setImmediate`
- **Absence from registry is not fraud** — new entities start neutral; risk only accumulates from positive evidence
