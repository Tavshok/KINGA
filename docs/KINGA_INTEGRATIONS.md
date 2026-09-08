# KINGA Integrations Manual

## 1. Evidence-based integration catalogue

| Integration category | Code/dependency evidence | Status from repository evidence | Safe interpretation |
|---|---|---|---|
| LLM / AI | `server/_core/llm.ts`, AI routers, pipeline modules | **Implemented code boundary** | Model/provider configuration is environment-controlled and must remain server-side. |
| Object storage | `server/storage.ts`, AWS S3 SDK dependencies | **Implemented code boundary** | Store file bytes through approved storage helpers; preserve metadata and authority checks. |
| Error monitoring | `server/_core/sentry.ts`, Sentry dependencies/tests | **Partially verified** | Integration code/dependencies exist; active DSN/project/alerting is [NOT VERIFIED IN CODEBASE]. |
| Notifications | `server/_core/notification.ts`, `server/notification-service.ts`, notification routers/services | **Implemented application feature** | Notification content and targets remain tenant/recipient controlled. |
| SMS/WhatsApp | `twilio` dependency exists | **[NOT VERIFIED IN CODEBASE AS AN ACTIVE WHATSAPP IMPLEMENTATION]** | Do not claim inbound/outbound WhatsApp production support without tracing an adapter, credentials and tests. |
| Maps | Google Maps type dependency/client map component | **Partially verified** | Client capability/dependency exists; actual API configuration and production use require source/environment verification. |
| PDF/document rendering | `pdfkit`, `pdf-lib`, `pdfjs-dist`, renderer/storage services | **Implemented code family** | Generated reports/documents must retain tenant and evidence authority. |
| Analytics/charts | Chart/Recharts dependencies and dashboard components | **Implemented UI capability** | Displayed KPIs require canonical server source verification. |

## 2. Integration change rules

Every integration change must document provider, server-side authentication location, inputs/outputs, timeout/retry/failure semantics, data classification, tenant boundary, audit/notification effect, test evidence and non-production verification plan. A dependency in `package.json` is not enough evidence that a feature is activated, configured or safe for production.

## 3. Failure behaviour

External-service failure must produce a truthful unavailable/degraded/error state. It must not fabricate a report, mark a document processed, substitute an unauthorised tenant, silently approve a decision, or retry indefinitely. Review the LLM circuit-breaker, pipeline retry paths, storage/error handlers and relevant router tests before modifying fallback behaviour.

## 4. Secrets

Secrets must remain in approved environment/secret storage. This manual intentionally omits secret names beyond those documented in `.env.example` and does not reproduce values. Provider account ownership, contractual SLAs, rate limits, webhook configuration, data residency, retention policy and callback endpoint registration are **[NOT VERIFIED IN CODEBASE]** unless separately proven for a specific deployed environment.
