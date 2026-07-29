# 04 — Type Contracts and Error Handling

## TypeScript Coverage

The KINGA codebase has **approximately 90 server-side files marked `// @ts-nocheck`** (as of July 2026). These are predominantly in the analytics, compliance, governance, and legacy assessment modules. The pipeline orchestrator (`server/pipeline-v2/orchestrator.ts`) and the core DB module (`server/db.ts`) are **not** `@ts-nocheck` — they are fully typed.

### Why `@ts-nocheck` Exists

These files were written rapidly during the initial build phase when the data model was still evolving. The `@ts-nocheck` directive was applied to suppress errors from:

1. **Drizzle ORM insert result shapes** — MySQL's `insertId` is returned as `{ insertId: string | number }` on the raw result, but Drizzle's TypeScript types do not expose this directly. The pattern `(result as unknown as { insertId: string | number }).insertId` appears throughout.
2. **Dynamic JSON column access** — Many columns store arbitrary JSON blobs. TypeScript cannot infer the shape of `JSON.parse(row.someJsonColumn)` without explicit casting.
3. **Legacy shape mismatches** — Some modules were written against an earlier schema version and not updated when columns were renamed or added.

### Policy Going Forward

New files MUST NOT use `@ts-nocheck`. Use `as unknown as T` casts with a comment explaining why, or add a proper type guard. Existing `@ts-nocheck` files should be migrated incrementally — do not add new logic to them without removing the directive first.

---

## Core Type Contracts

### `ClaimRecord` (Stage 5 output)

Defined in `server/pipeline-v2/types.ts`. This is the canonical structured extraction of a claim document. All downstream stages consume this type.

Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `claimant` | `ClaimantInfo` | Name, contact, ID number |
| `vehicle` | `VehicleInfo` | Make, model, year, VIN, registration |
| `incident` | `IncidentInfo` | Date, location, description, type |
| `driver` | `DriverInfo` | Insured driver details |
| `thirdParty` | `ThirdPartyInfo \| null` | Third-party vehicle and driver |
| `quotes` | `RepairQuote[]` | Extracted repair quotations |
| `damageDescription` | `string` | Free-text damage description |
| `claimantStatedSpeed` | `number \| null` | **Immutable** — never overwritten after Stage 3 |
| `incidentType` | `string` | Classified incident type |
| `productType` | `string` | Insurance product class |

### `PipelineResult` (orchestrator output)

Defined in `server/pipeline-v2/types.ts`. The full output of `runPipelineV2()`. Every field is nullable — a stage that fails or is skipped returns `null` for its output field.

**Critical rule:** If you add a new stage that produces output, you MUST:
1. Add the output field to `PipelineResult` in `types.ts`
2. Add the persistence block in `db.ts` (the `upsert` call after `runPipelineV2` returns)
3. Add the corresponding column to `ai_assessments` in `drizzle/schema.ts`
4. Run `pnpm db:push` to migrate the schema

Failure to do step 2 will silently drop the stage output — it will be computed but never saved.

### `WorkflowState` and `InsurerRole`

Both are defined as TypeScript union types in `server/rbac.ts`. The DB stores these as `varchar` columns (not MySQL enums), so the TypeScript type is the enforcement mechanism. Always use the type, never raw strings.

---

## tRPC Procedure Patterns

### Public vs. Protected

```ts
// Public — no auth required
publicProcedure.query(...)

// Protected — requires valid session cookie
protectedProcedure.query(...)

// Insurer domain — requires insurer role + tenantId resolution
insurerDomainProcedure.query(...)

// Admin only
adminProcedure.query(...)
```

`insurerDomainProcedure` is defined in `server/routers.ts`. It wraps `protectedProcedure` and additionally resolves `ctx.insurerTenantId` from the user's `tenantId`. All insurer-facing queries MUST use this procedure to ensure tenant isolation.

### Input Validation

All procedure inputs are validated with Zod. The schema is the contract — if a field is not in the Zod schema, it cannot reach the handler. Never bypass Zod with `z.any()` in new code.

### Error Handling Convention

Procedures throw `TRPCError` with a typed `code`:

| Code | When to use |
|------|------------|
| `UNAUTHORIZED` | No valid session |
| `FORBIDDEN` | Valid session but insufficient role/permission |
| `NOT_FOUND` | Resource does not exist or is outside the user's tenant scope |
| `BAD_REQUEST` | Invalid input that passed Zod but failed business logic |
| `INTERNAL_SERVER_ERROR` | Unexpected error — always log the original error before throwing |

**Do not swallow errors silently.** If a stage in the pipeline fails non-fatally, log it with `ctx.log(stageName, errorMessage)` and continue. If it is fatal, throw a `PipelineIncompleteError` (defined in `server/pipeline-v2/types.ts`).

---

## Pipeline Error Types

Defined in `server/pipeline-v2/types.ts`:

| Error class | When thrown | Effect |
|------------|------------|--------|
| `PipelineIncompleteError` | Stage cannot proceed (missing required input, fatal LLM failure) | Pipeline aborts; claim set to `document_failed` |
| `StageTimeoutError` | Stage exceeds its time budget | Non-fatal by default; logged and stage marked as timed out in `PipelineRunSummary` |

The watchdog timer in `triggerAiAssessment` (`server/db.ts`) fires after 8 minutes and sets:
- `claims.status = 'document_failed'`
- `claims.documentProcessingStatus = 'DOCUMENT_FAILED'`
- `claims.workflowState = 'intake_queue'`

This ensures the claim is always recoverable by the recovery job (Case 11).

---

## LLM Call Conventions

All LLM calls go through `invokeLLM()` in `server/_core/llm.ts`. Key rules:

1. **Server-side only** — never call from client code
2. **Always set a timeout** — the default is 45 seconds; use `timeoutMs` override for large PDF extraction calls (up to 90s)
3. **Structured output** — use `response_format: { type: "json_schema", ... }` when you need a typed response. Parse with `JSON.parse(response.choices[0].message.content)` and validate with Zod
4. **Thinking budget** — set `budget_tokens: 0` to disable chain-of-thought for fast classification tasks; leave unset for complex reasoning
5. **Vision calls** — pass image URLs as `{ type: "image_url", image_url: { url: "..." } }` content items. The proxy handles authentication automatically — do not add API keys to image URLs

---

## `@ts-nocheck` Inventory (selected files)

The following files carry `@ts-nocheck` and are most likely to be touched during maintenance. Each has a note on why:

| File | Reason |
|------|--------|
| `server/accidentPhysics.ts` | Complex numeric computation with dynamic object shapes |
| `server/assessment-processor.ts` | Legacy shape mismatches from early schema iterations |
| `server/cost-optimization.ts` | Dynamic JSON column access, Drizzle insert result casting |
| `server/analytics-db.ts` | Dynamic aggregation queries with inferred column types |
| `server/upload-documents.ts` | Drizzle insert result `insertId` casting (documented in file header) |
| `server/claim-form-extractor.ts` | LLM response parsing with dynamic shapes |
| `server/confidence-scoring-engine.ts` | Numeric computation with many intermediate types |

When editing these files, add explicit type annotations to any new code you write, even if the surrounding code is untyped.
