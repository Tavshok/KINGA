# KINGA Engineering Manual

**Author:** Tavonga Shoko  
**Last updated:** July 2026  
**Status:** Living document — update when behaviour changes, not after the fact.

---

## About This Manual

This manual is the canonical engineering reference for KINGA — a forensic motor insurance claims intelligence platform. It is written for engineers (including future contractors) who have general full-stack experience but zero prior KINGA context. Every statement in this manual was verified against the actual codebase at the time of writing. Where something could not be verified, it is marked **[needs verification]**.

This manual does **not** contain exact fraud-scoring weights, detection thresholds, pricing tiers, or any real customer data. Those are deliberately excluded.

---

## Sections

| # | File | Contents |
|---|------|----------|
| 1 | [01-system-overview.md](./01-system-overview.md) | What KINGA does, the high-level pipeline, data flow |
| 2 | [02-architecture.md](./02-architecture.md) | Services, modules, portal structure, orchestrator contract |
| 3 | [03-data-model.md](./03-data-model.md) | Core DB tables, relationships, read/write ownership |
| 4 | [04-type-contracts.md](./04-type-contracts.md) | Type enforcement, `@ts-nocheck` inventory, error conventions |
| 5 | [05-pipeline.md](./05-pipeline.md) | Full stage-by-stage pipeline reference |
| 6 | [06-report-stack.md](./06-report-stack.md) | Report tiers, HTML/PDF rendering, design tokens |
| 7 | [07-failure-modes.md](./07-failure-modes.md) | Known bugs found and fixed — do not reintroduce |
| 8 | [08-verification.md](./08-verification.md) | How to verify a change is correct |
| 9 | [09-extension-points.md](./09-extension-points.md) | How to add fields, claim types, portals safely |

---

## Quick Reference

**Tech stack:** React 19 + Tailwind 4 + Express 4 + tRPC 11 + Drizzle ORM + MySQL/TiDB  
**Auth:** Manus OAuth — session cookie, `protectedProcedure` injects `ctx.user`  
**AI:** LLM calls via `invokeLLM()` helper (server-side only), PDF rendering via `pdftoppm` + vision  
**PDF export:** `puppeteer-core` + system Chromium (`/usr/bin/chromium`)  
**File storage:** S3 via `storagePut` / `storageGet` helpers  
**Pipeline:** `server/pipeline-v2/orchestrator.ts` — single entry point `runPipelineV2()`  
**Recovery:** `server/stuck-assessment-recovery-job.ts` — runs every 10 minutes  
**Concurrency:** Max 1 pipeline at a time — in-process semaphore in `server/db.ts`
