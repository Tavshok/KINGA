# KINGA AI Model Strategy
## Architecture, Migration Path, and Model Selection

**Document version:** 1.0  
**Date:** June 2026  
**Status:** Approved for engineering handover

---

## 1. Executive Summary

KINGA currently processes all AI inference through a single abstraction layer that calls one model — Gemini 2.5 Flash — for every task from raw PDF OCR to fraud narrative generation. This works, and it works well. The architecture is sound: one entry point, one configuration change to swap models, zero AI SDK code in business logic.

The strategic question is not whether to change the architecture — it is already correct — but how to evolve it without adding cost during development, and how to migrate to the best available model for each task type as KINGA scales to production volumes.

This document sets out the current state, the zero-cost development approach, the migration path, and the model selection rationale.

---

## 2. Current State

### 2.1 Architecture

All AI calls in KINGA flow through a single function: `invokeLLM()` in `server/_core/llm.ts`. This function calls a Manus-managed proxy (`BUILT_IN_FORGE_API_URL`) using the OpenAI Chat Completions API format. The model is set in one place — line 285 of that file — currently `"gemini-2.5-flash"`.

The pipeline has 10 LLM stages and 3 deterministic stages, as registered in `server/pipeline-v2/pipelineContractRegistry.ts`. Outside the pipeline, a further 19 service files call `invokeLLM()` directly for tasks such as report generation, demand letter writing, police report OCR, and vehicle valuation.

**Total `invokeLLM` call sites: 75** across the codebase.

### 2.2 Token Configuration

The default token budget per call is 8,192 tokens. One exception exists: Stage 2 (Raw OCR Text Extraction) overrides this to 16,384 tokens to handle dense multi-page documents. Extended thinking (`budget_tokens`) is disabled globally, which is correct — it reduces latency significantly on Gemini 2.5 Flash without meaningful quality loss for structured extraction tasks.

### 2.3 What Is Hardcoded Outside the Abstraction Layer

Three files contain model name strings outside `llm.ts`:

| File | Value | Impact |
|---|---|---|
| `pipeline-v2/felVersionRegistry.ts` | `"gpt-4o"` | Metadata label only — not an API call |
| `pipeline/document-intelligence.ts` | `"gemini-2.5-flash"` | Legacy pipeline (not active v2) |
| `services/historical-claims-ingestion.ts` | `"gpt-4-vision"` | String label only — not an API call |

None of these affect runtime behaviour. They are documentation artefacts and should be updated to reflect the current model when the files are next touched.

### 2.4 Cost Structure

KINGA currently runs on the Manus built-in API (`BUILT_IN_FORGE_API_KEY`), which abstracts billing. When migrating to direct provider APIs, the cost structure per claim will be approximately as follows, based on Gemini 2.5 Flash pricing as of June 2026:

| Stage | Typical input tokens | Typical output tokens | Notes |
|---|---|---|---|
| Stage 1 — Document Ingestion | 2,000–8,000 | 500 | Vision + text |
| Stage 2 — OCR Extraction | 4,000–16,000 | 2,000 | Largest token consumer |
| Stage 3 — Structured Extraction | 3,000–8,000 | 1,500 | JSON schema output |
| Stage 4 — Field Recovery | 1,500–4,000 | 800 | |
| Stage 6 — Damage Analysis | 2,000–6,000 | 1,000 | Vision |
| Stage 7 — Physics & Unified | 3,000–8,000 | 1,500 | Reasoning-intensive |
| Stage 8 — Fraud Analysis | 4,000–10,000 | 2,000 | Reasoning-intensive |
| Stage 9 — Cost Optimisation | 2,000–5,000 | 800 | |
| Stage 10 — Report Generation | 6,000–12,000 | 3,000 | Largest output |
| Supporting services (avg) | 2,000–5,000 | 1,000 | Per-claim average |

Rough estimate: **30,000–80,000 tokens per claim** across all pipeline and service calls. At Gemini 2.5 Flash pricing (~$0.075/M input, ~$0.30/M output), a fully processed claim costs approximately **$0.01–$0.03**. This is the baseline to protect.

---

## 3. Zero-Cost Development Approach

The principle is simple: **during development, never add a new AI call without removing or consolidating an existing one.**

### 3.1 Rules for New Development

Every engineer adding a feature that involves AI must follow these rules:

**Rule 1 — Use the abstraction layer, always.** Call `invokeLLM()`. Never import an AI provider SDK. Never hardcode a model name. Never construct a direct HTTP call to an AI provider endpoint. The model behind `invokeLLM()` is a configuration decision, not a code decision.

**Rule 2 — Classify before you call.** Before writing a new `invokeLLM()` call, classify the task:

- **Extraction task** (parse structured fields from a document): use the existing Stage 2/3 pipeline. Do not add a new call — extend the existing extraction prompt.
- **Validation task** (check a field against rules): implement deterministically. AI is not needed for rule-based checks.
- **Reasoning task** (fraud narrative, causal analysis, report generation): justify the new call in a code comment with the specific reasoning requirement that cannot be met deterministically.

**Rule 3 — Batch, do not scatter.** If a new feature needs three pieces of information from a document, extract all three in one call with a structured schema, not three separate calls.

**Rule 4 — Token budgets are hard limits.** The default 8,192-token output limit exists for cost control. Do not raise it without a documented reason. Stage 2's 16,384 override is the only current exception and it is justified by multi-page PDF density.

**Rule 5 — Test with mocks.** All pipeline tests use mocked `invokeLLM` responses. New features must do the same. Tests must never make real API calls.

### 3.2 Current Consolidation Opportunities

The following are areas where calls can be reduced without losing functionality:

| Opportunity | Current state | Proposed change | Estimated saving |
|---|---|---|---|
| `services/mismatchNarrative.ts` (2 calls) | Two separate narrative calls | Merge into one call with combined prompt | 1 call per claim |
| `services/photoEnrichment.ts` (2 calls) | Two photo analysis calls | Merge into one multi-image call | 1 call per claim |
| `routers.ts` (4 inline calls) | Ad-hoc calls inside router procedures | Move to dedicated service files; batch where possible | Cleaner, auditable |
| `assessment-processor.ts` (6 calls) | Sequential calls | Review for parallelisation and prompt consolidation | Latency reduction |

These are not urgent but should be addressed as each file is touched during normal development.

---

## 4. Model Selection Strategy

### 4.1 The Landscape in June 2026

The AI model market has stabilised into three credible providers for production insurance workloads: Google (Gemini), Anthropic (Claude), and OpenAI (GPT). All three offer OpenAI-compatible API formats, which means switching between them requires changing a URL, an API key, and a model name — nothing more, given KINGA's current architecture.

The key developments since early 2025 that affect KINGA's strategy:

**Gemini 2.5 Flash** has matured into the strongest cost-efficient model for structured extraction. Its native multimodal capability (text + image in a single call) and fast inference make it the correct choice for high-volume pipeline tasks. The `budget_tokens: 0` configuration (thinking disabled) is the right setting for extraction — it eliminates the latency overhead of extended reasoning on tasks that do not require it.

**Claude Sonnet 4** (Anthropic, released 2025) has become the strongest model for long-document reasoning, nuanced fraud narrative, and complex causal analysis. Independent benchmarks consistently show it outperforming GPT-4o on document-heavy tasks. For KINGA's fraud analysis and report generation stages, this matters.

**GPT-4o** remains reliable and well-understood but is no longer the clear leader in any specific task category relevant to KINGA. It remains a valid fallback option.

### 4.2 Recommended Model Assignments

The recommendation is a **two-tier model strategy** within the existing abstraction layer. No new architecture is required — only a `tier` parameter on `invokeLLM()` and a routing table in `llm.ts`.

| Tier | Model | Tasks | Rationale |
|---|---|---|---|
| **Fast** | Gemini 2.5 Flash | Stages 1, 2, 3, 4 (OCR, extraction, field recovery), photo forensics, police report OCR, intake normalisation, vehicle valuation | High volume, well-defined structured output, cost-sensitive, vision capability needed |
| **Deep** | Claude Sonnet 4 | Stages 7, 8, 10 (physics reasoning, fraud analysis, report generation), mismatch narrative, demand letter generation | Reasoning-intensive, long output, quality-critical, runs once per claim |

This split means the majority of calls (by volume) stay on the cheaper Fast tier, while the three stages where model quality most directly affects adjuster decisions move to the stronger Deep tier.

### 4.3 What This Does Not Change

The abstraction layer, the pipeline architecture, the stage contracts, the type system, and all tests remain unchanged. The only code change is in `server/_core/llm.ts`: add a `tier` parameter, add a routing table, and update the three stages that move to the Deep tier to pass `tier: "deep"`. Every other call site requires no change.

---

## 5. Migration Plan

Migration is structured in three phases, each of which can be executed independently and rolled back without affecting the others.

### Phase 1 — Formalise the Tier Architecture (Zero cost, zero risk)

**When:** Before the next feature sprint begins.  
**What:** Add the `tier` parameter to `invokeLLM()` in `server/_core/llm.ts`. Initially, both tiers route to the same model (Gemini 2.5 Flash). This is a non-breaking change — all existing call sites continue to work without modification, defaulting to `tier: "fast"`.

```typescript
// server/_core/llm.ts — proposed change (illustrative)
export type LLMTier = "fast" | "deep";

export async function invokeLLM(params: InvokeParams & { tier?: LLMTier }): Promise<InvokeResult> {
  const tier = params.tier ?? "fast";
  const model = tier === "deep"
    ? (ENV.llmModelDeep ?? "gemini-2.5-flash")   // falls back to Flash if not configured
    : (ENV.llmModelFast ?? "gemini-2.5-flash");
  // ... rest unchanged
}
```

Two environment variables control the models: `LLM_MODEL_FAST` and `LLM_MODEL_DEEP`. During development, both are unset and both tiers use Gemini 2.5 Flash. In production, `LLM_MODEL_DEEP` is set to `claude-sonnet-4` (or whichever model is current). **No code change is needed to switch models in production — it is a configuration change.**

**Deliverable:** Updated `llm.ts`, updated `env.ts`, updated `README.md` with the tier convention.

### Phase 2 — Annotate Call Sites (Zero cost, zero risk)

**When:** Alongside Phase 1, or as part of the next sprint.  
**What:** Add `tier: "deep"` to the three reasoning-intensive stages. All other call sites require no change.

Files to update:
- `server/pipeline-v2/stage-7b-causal-reasoning.ts` — add `tier: "deep"`
- `server/pipeline-v2/stage-8-fraud.ts` — add `tier: "deep"`
- `server/pipeline-v2/kingaReportSystemPrompt.ts` / `report-narrative-generator.ts` — add `tier: "deep"`
- `server/recovery/demandLetterGenerator.ts` — add `tier: "deep"`
- `server/services/mismatchNarrative.ts` — add `tier: "deep"`

This is a 5-file change, approximately 10 lines total.

**Deliverable:** Updated call sites, updated tests confirming tier annotation is passed correctly.

### Phase 3 — Production Model Activation (Cost increase, quality increase)

**When:** When KINGA moves to production volume and the quality improvement in fraud analysis and report generation justifies the cost delta.  
**What:** Set `LLM_MODEL_DEEP=claude-sonnet-4` (or the best available model at that time) in the production environment. No code change required.

**Before activating:** Run a parallel evaluation on 50 real claims — process each claim with both Gemini 2.5 Flash and the Deep tier model, compare fraud scores, narrative quality, and report completeness. Document the quality delta. This provides the business case for the cost increase.

**Estimated cost impact:** Deep tier calls represent approximately 3–4 of the 10 pipeline LLM stages. If Claude Sonnet 4 costs approximately 3–5× more than Gemini 2.5 Flash per token, and those stages represent roughly 40% of total tokens, the per-claim cost increase is approximately 1.2–2× the current baseline — from ~$0.01–0.03 to ~$0.02–0.06 per claim. At insurance claim volumes, this is negligible relative to the cost of a missed fraud case.

---

## 6. Provider Migration (If Leaving the Manus Proxy)

The current architecture calls the Manus-managed proxy, which abstracts the underlying provider. If KINGA migrates to direct provider APIs (e.g., calling Google AI or Anthropic directly), the change is confined to three lines in `server/_core/llm.ts`:

1. The `resolveApiUrl()` function — change the endpoint URL
2. The `authorization` header — change the API key source
3. The `model` field in the payload — change the model name

All 75 call sites, all pipeline stages, all tests, and all business logic remain unchanged. This is the correct architecture for provider independence.

The only additional consideration for direct provider migration is that the Manus proxy currently normalises some response format differences between providers. If calling Anthropic's API directly, the response format differs slightly from the OpenAI format that `invokeLLM` currently parses. A thin normalisation adapter in `llm.ts` would handle this — approximately 20 lines.

---

## 7. Standards for New Development

Every engineer working on KINGA must follow these standards when writing AI-related code. These are not suggestions — they are the rules that keep the codebase maintainable and costs predictable.

**The single rule that covers everything:** AI logic lives in `server/_core/llm.ts` and nowhere else. Business logic calls `invokeLLM()`. The model, the endpoint, the API key, and the tier routing are configuration — not code.

| Standard | Rule |
|---|---|
| Model names | Never appear outside `server/_core/llm.ts` |
| Provider SDKs | Never imported in any file except `server/_core/llm.ts` |
| New AI calls | Must be classified (extraction / validation / reasoning) before implementation |
| Validation logic | Must be implemented deterministically unless it demonstrably requires language understanding |
| Token budgets | Default 8,192 output tokens; override only with documented justification |
| Tests | Must mock `invokeLLM` — never make real API calls in tests |
| Tier annotation | All new calls must specify `tier: "fast"` or `tier: "deep"` once Phase 1 is implemented |
| Prompt changes | Treated as code changes — reviewed, tested, and logged in CHANGELOG |

---

## 8. Summary

KINGA's AI architecture is already correct. The abstraction is in place, the pipeline is well-structured, and the model is configured in one location. The work required to prepare for migration is small and low-risk.

The immediate priority is Phase 1 and Phase 2 of the migration plan — formalising the tier architecture and annotating call sites. This costs nothing, adds no new calls, and positions KINGA to activate the best available model for reasoning-intensive tasks with a single configuration change when the time is right.

The model recommendation as of June 2026 is: **Gemini 2.5 Flash for extraction, Claude Sonnet 4 for reasoning**. This recommendation should be reviewed every six months — the AI landscape moves quickly and the best model for a given task changes. The architecture ensures that reviewing and acting on that recommendation costs one configuration change, not a code migration.

---

*This document should be reviewed and updated whenever a new model tier is activated in production, or when a significant new AI capability is added to the pipeline. It lives at `KINGA_AI_MODEL_STRATEGY.md` in the project root alongside `README.md` and `CHANGELOG.md`.*
