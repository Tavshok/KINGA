# KINGA System Context Diagram

**Author:** Tavonga Shoko, Lead Engineer

This diagram shows KINGA in relation to all external actors and systems.

```mermaid
C4Context
  title KINGA AutoVerify AI — System Context

  Person(claimant, "Claimant / Client", "Individual or company submitting a motor claim or requesting insurance/valuation")
  Person(assessor, "Assessor", "External or internal assessor reviewing claim evidence")
  Person(panelBeater, "Panel Beater", "Repair shop submitting quotes and repair updates")
  Person(fleetMgr, "Fleet Manager", "Company managing a vehicle fleet")
  Person(agent, "Agency Broker", "Insurance agent handling quotations and policies")
  Person(engineer, "Engineer", "Conducting vehicle inspections and asset assessments")
  Person(insurer, "Insurer Staff", "Claims processor, risk manager, executive, admin")
  Person(platformAdmin, "Platform Admin", "KINGA platform administrator — governance and monitoring")

  System(kinga, "KINGA AutoVerify AI", "Multi-portal motor insurance intelligence platform. Processes claims through a 14-stage AI pipeline. Generates CL, CI, and FR reports.")

  System_Ext(whatsapp, "WhatsApp / Twilio", "Inbound claim submission and outbound notifications via WhatsApp Business API")
  System_Ext(tidb, "TiDB / MySQL", "Primary database — claims, assessments, quotes, benchmarks, audit trail")
  System_Ext(s3, "Manus S3 Storage", "Document and photo storage — PDFs, images, reports")
  System_Ext(llm, "Manus LLM API", "Large language model — document extraction, interpretation, fraud narrative")
  System_Ext(manus, "Manus Platform", "OAuth authentication, notifications, Heartbeat scheduling, built-in APIs")
  System_Ext(insSystem, "Insurer Core Systems", "Future: underwriting system API integration for policy lookup")

  Rel(claimant, kinga, "Submits claims, requests valuations, views reports", "HTTPS / WhatsApp")
  Rel(assessor, kinga, "Reviews assessments, uploads reports", "HTTPS")
  Rel(panelBeater, kinga, "Submits repair quotes, updates repair status", "HTTPS")
  Rel(fleetMgr, kinga, "Manages fleet, monitors claims", "HTTPS")
  Rel(agent, kinga, "Handles quotations, delivers policies", "HTTPS")
  Rel(engineer, kinga, "Conducts inspections, generates asset passports", "HTTPS")
  Rel(insurer, kinga, "Processes claims, approves settlements, views analytics", "HTTPS")
  Rel(platformAdmin, kinga, "Governs platform, manages tenants, monitors health", "HTTPS")

  Rel(kinga, whatsapp, "Receives inbound messages, sends notifications", "Twilio API")
  Rel(kinga, tidb, "Reads and writes all business data", "Drizzle ORM / MySQL protocol")
  Rel(kinga, s3, "Stores and retrieves documents and photos", "S3 API")
  Rel(kinga, llm, "Invokes LLM for extraction, interpretation, fraud analysis", "REST API")
  Rel(kinga, manus, "OAuth login, in-app notifications, Heartbeat crons", "Manus SDK")
  Rel(kinga, insSystem, "Future: policy lookup by registration plate", "REST API (planned)")
```

## Key Observations

KINGA is the central hub for all motor insurance intelligence. It does not own the underwriting system — it processes claims and generates intelligence that informs decisions made by insurer staff. The LLM is used as an advisory tool only; all decisions require human approval.

The WhatsApp channel is the primary intake channel for claimants in the Zimbabwean market, where smartphone penetration is high but web browser usage for insurance is low.
