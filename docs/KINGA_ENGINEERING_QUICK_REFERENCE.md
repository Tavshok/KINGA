# KINGA Engineering Quick Reference

## Start here

| Need | Read / run |
|---|---|
| Learn the platform | `KINGA_SYSTEM_OVERVIEW.md`, `KINGA_ARCHITECTURE.md` |
| Find feature code | `KINGA_CODEBASE_GUIDE.md`; then trace from `client/src/App.tsx` and `server/routers.ts` |
| Understand access safety | `KINGA_SECURITY_MANUAL.md`, `KINGA_ARCHITECTURAL_INVARIANTS.md` |
| Change a report | `server/reporting/` and canonical resolver/model tests first |
| Change pipeline/AI | `server/pipeline-v2/`, `KINGA_CLAIMS_INTELLIGENCE_MANUAL.md`, `KINGA_AI_ENGINEERING_MANUAL.md` |
| Change data | `drizzle/schema.ts`, drift audit/remediation docs, database manual |
| Run locally | `KINGA_LOCAL_DEVELOPMENT.md` |

## Key commands

```bash
pnpm install --frozen-lockfile
pnpm check:conflicts
pnpm check
pnpm test
pnpm test:integration
pnpm check:server
pnpm build
pnpm dev
```

## Key source locations

| Concern | Location |
|---|---|
| Client routes | `client/src/App.tsx` |
| Typed client API | `client/src/lib/trpc.ts` |
| Runtime/context/auth | `server/_core/index.ts`, `context.ts`, `trpc.ts`, `domain-middleware.ts` |
| Router map | `server/routers.ts`, `server/routers/` |
| Database schema | `drizzle/schema.ts`, `drizzle.config.ts` |
| Reporting contracts | `server/reporting/resolvedReportRecord.ts`, `resolvedPlatformReportCollection.ts`, `forensicReportModel.ts` |
| Pipeline | `server/pipeline-v2/` |
| Workflows | `server/workflow-*.ts`, `server/routers/workflow*.ts` |
| Security test references | `server/engineer/inspectionAuthority.p0.test.ts`, `server/routers/notificationsTenantAuthority.p0.test.ts` |

## Never forget

- Derive tenant authority from the authenticated session; never trust a request tenant ID.
- Authorise the target object before reading related data or creating side effects.
- AI/evidence/recommendation/approval are different concepts.
- Reports must use canonical contracts for shared facts.
- Use owned fixtures and precise cleanup.
- State incomplete tests/builds honestly.
- Escalate schema, auth, workflow, canonical-contract, evidence/physics and provider changes for architectural review.
