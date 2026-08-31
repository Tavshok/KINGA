# KINGA AI and LLM Engineering Manual

## 1. Server-side AI boundary

The implementation uses a server-side LLM integration boundary at `server/_core/llm.ts`. AI-related application entry points include `server/routers/ai-analysis.ts`, `ai-assessments-core.ts`, and `ai-reanalysis.ts`; pipeline use is concentrated under `server/pipeline-v2/`. Client components must not embed model credentials or independently submit privileged claim evidence to an unreviewed provider path.

## 2. Controls represented in code

| Control | Evidence | Engineering meaning |
|---|---|---|
| Structured outputs | Stage/prompt schema definitions in pipeline modules | Parse and validate output rather than treating free text as a fact. |
| Retry and timeouts | Stage 6 vision timeout/retry helpers | Fail/degrade with evidence, rather than hang or silently claim success. |
| Confidence and provenance | pipeline evidence envelopes, per-photo results, report presentations | Keep source/eligibility/confidence attached to the finding. |
| Fallbacks | Stage 6 fallback and degradation pathways | A fallback must be labelled and must not fabricate observations. |
| Circuit-breaker regression | `server/_core/llm.circuit-breaker.test.ts` | Repeated provider failure should have controlled behaviour. |
| Human workflow | decision, approval and review routers | AI output alone is not an authoritative business decision. |

## 3. AI persistence and authority

AI-associated records are represented in the schema and consumed by assessment/reporting code, including `ai_assessments`. Persisting a model response makes it a stored analysis record; it does not elevate it to approved claim fact. Any change from AI output to claim status, payable value, fraud outcome or customer communication must identify the explicit non-AI validation/approval path that authorises it.

## 4. Prompt, model and cost changes

Before changing a prompt, structured schema, model option, retry count, timeout, token/budget control or evidence eligibility rule:

1. Trace all callers and persisted fields.
2. Read existing tests and add behavioural coverage for valid, unavailable and degraded inputs.
3. Confirm tenant/object authority before the provider call.
4. Confirm output labels still distinguish observed evidence, AI interpretation and human decision.
5. Record provider/configuration changes without exposing secrets.

Exact live model selection, provider account configuration, token quotas, price commitments, rate limits, data-processing agreements and retention terms are **[NOT VERIFIED IN CODEBASE]**. Do not infer them from dependencies or environment-variable names.

## 5. Hallucination and unsupported-output controls

The documented safety posture is to constrain outputs, normalise component names, keep confidence/provenance, exclude unsupported physics measurements, represent unavailable evidence honestly, and route decisions through authorised human/governed workflows. An engineer must preserve all of these controls when refactoring. A neat-looking generated narrative is never evidence of a verified claim fact.
