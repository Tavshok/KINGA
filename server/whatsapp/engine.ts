/**
 * WhatsApp Conversation Engine — Main Orchestrator
 * ─────────────────────────────────────────────────
 * Receives a normalised IncomingMessage, loads/creates the session,
 * routes to the correct journey handler, saves the session, and sends
 * the response via the provider adapter.
 *
 * This is the single entry point for all inbound WhatsApp messages.
 */

import { loadSession, createSession, saveSession } from "./sessionManager";
import type { Session } from "./sessionManager";
import { TwilioAdapter, MockWhatsAppAdapter, type IWhatsAppProvider } from "./provider";
import type { IncomingMessage } from "./types";
import { handleClaimState } from "./claimJourney";
import { handleStatusJourney, handleQuoteState, handleValuationState } from "./otherJourneys";
import { getDbOrThrow } from "../db";
import { claims, insurerTenants, users } from "../../drizzle/schema";
import type { ClaimSessionData } from "./types";
import { and, eq, or } from "drizzle-orm";
import { createHash } from "crypto";
import { persistCanonicalClaimIntake, startCanonicalIntakeAssessment, type CanonicalIntakeActor } from "../services/canonicalClaimIntake";
import { submitAndStartCanonicalIntake } from "../services/canonicalIntakeSubmission";
import { applyWhatsAppSubmissionSideEffects } from "./submissionSideEffects";

// ─── Provider Singleton ───────────────────────────────────────────────────────

let _provider: IWhatsAppProvider | null = null;

export function initWhatsAppProvider(): IWhatsAppProvider {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (accountSid && authToken && fromNumber) {
    console.log("[WA] Initialising Twilio adapter");
    _provider = new TwilioAdapter(accountSid, authToken, fromNumber);
  } else {
    console.log("[WA] Twilio credentials not set — using MockWhatsAppAdapter (local testing)");
    _provider = new MockWhatsAppAdapter();
  }
  return _provider;
}

export function getWhatsAppProvider(): IWhatsAppProvider | null {
  return _provider;
}

// ─── Greeting Buttons ─────────────────────────────────────────────────────────

const GREETING_BUTTONS = [
  { id: "claim",     title: "Report an accident or loss" },
  { id: "status",    title: "Follow up on a claim" },
  { id: "quote",     title: "Get an insurance quote" },
  { id: "valuation", title: "Get a vehicle valuation" },
];

const normalisePhone = (phone: string) => phone.replace(/[^\d+]/g, "");
const normaliseInsurer = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * WhatsApp is a public intake channel. It may only create a canonical claim after
 * the selected insurer is mapped to a registered tenant. A known tenant-bound
 * phone is linked to its existing account; otherwise a restricted claimant identity
 * is created in that tenant so later portal registration can attach rather than fork.
 */
export async function resolveWhatsAppCanonicalActor(phone: string, insurerName?: string): Promise<CanonicalIntakeActor> {
  if (!insurerName) throw new Error("No insurer was selected for this WhatsApp claim.");
  const db = await getDbOrThrow();
  const requestedInsurer = normaliseInsurer(insurerName);
  const tenantRows = await db.select({ id: insurerTenants.id, name: insurerTenants.name, displayName: insurerTenants.displayName }).from(insurerTenants);
  const tenant = tenantRows.find((row) => normaliseInsurer(row.name) === requestedInsurer || normaliseInsurer(row.displayName) === requestedInsurer);
  if (!tenant) throw new Error("The selected insurer is not configured for secure WhatsApp claim intake.");

  const verifiedPhone = normalisePhone(phone);
  const [existing] = await db.select({ id: users.id, role: users.role, tenantId: users.tenantId })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.phoneNumber, verifiedPhone), eq(users.isActive, 1)))
    .limit(1);
  if (existing) return { id: existing.id, tenantId: tenant.id, role: existing.role, uploadKeyPrefixes: ["whatsapp-claims/"] };

  const priorClaims = await db.select({ claimantId: claims.claimantId })
    .from(claims)
    .where(and(eq(claims.tenantId, tenant.id), eq(claims.claimantPhone, verifiedPhone)))
    .limit(1);
  if (priorClaims[0]?.claimantId) {
    const [priorClaimant] = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.id, priorClaims[0].claimantId), eq(users.tenantId, tenant.id), eq(users.isActive, 1)))
      .limit(1);
    if (priorClaimant) return { id: priorClaimant.id, tenantId: tenant.id, role: priorClaimant.role, uploadKeyPrefixes: ["whatsapp-claims/"] };
  }

  const guestOpenId = `whatsapp:${tenant.id}:${createHash("sha256").update(verifiedPhone).digest("hex").slice(0, 32)}`;
  const [created] = await db.insert(users).values({ openId: guestOpenId, name: "WhatsApp claimant", phoneNumber: verifiedPhone, role: "claimant", tenantId: tenant.id, emailVerified: 0, isUnregisteredClaimant: 1 }).$returningId();
  return { id: Number(created.id), tenantId: tenant.id, role: "claimant", uploadKeyPrefixes: ["whatsapp-claims/"] };
}

function matchGreeting(input: string): string | null {
  const lower = input.toLowerCase().trim();
  if (lower.includes("accident") || lower.includes("claim") || lower.includes("report") || lower === "1") return "claim";
  if (lower.includes("follow") || lower.includes("status") || lower.includes("update") || lower === "2") return "status";
  if (lower.includes("quote") || lower.includes("insur") || lower === "3") return "quote";
  if (lower.includes("valuat") || lower.includes("value") || lower === "4") return "valuation";
  return null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const provider = _provider ?? initWhatsAppProvider();
  const phone = msg.from.replace("whatsapp:", "");

  // Load or create session
  let session = await loadSession(phone);

  // Handle paused/resumed session
  if (session?.status === "paused" && session.state !== "IDLE") {
    await provider.sendText(
      phone,
      `Welcome back. 👋\n\n${session.resumeContext ?? "You had an incomplete session."}\n\nShall we continue?`
    );
    await provider.sendButtons(phone, "", [
      { id: "continue", title: "Yes, continue" },
      { id: "new",      title: "Start something new" },
    ]);
    // Update session to active
    session.status = "active";
    await saveSession(session);
    return;
  }

  // Check if client is continuing or starting new
  const input = msg.body?.trim() ?? "";
  const lower = input.toLowerCase();

  // "status" keyword shortcut
  if (lower === "status" || lower === "check status") {
    await handleStatusJourney(phone, provider);
    return;
  }

  // No active session or IDLE — show greeting
  if (!session || session.state === "IDLE" || session.state === "GREETING" || session.status === "submitted" || session.status === "expired") {
    const intent = matchGreeting(input);
    if (!intent) {
      // Send welcome
      session = await createSession(phone);
      await provider.sendText(
        phone,
        `Hi there 👋\n\nWelcome to *KINGA* — your insurance and claims assistant.\n\nHow can I help you today?`
      );
      await provider.sendButtons(phone, "", GREETING_BUTTONS);
      return;
    }
    // Direct intent detected — create session and route
    session = await createSession(phone);
    await routeIntent(session, intent, msg, provider);
    return;
  }

  // Active session — route to current journey
  await routeActiveSession(session, msg, provider);
}

async function routeIntent(
  session: Session,
  intent: string,
  msg: IncomingMessage,
  provider: IWhatsAppProvider
): Promise<void> {
  const phone = session.phoneNumber;

  if (intent === "status") {
    await handleStatusJourney(phone, provider);
    return;
  }

  if (intent === "claim") {
    session.intent = "CLAIM";
    session.state = "CLAIM_INSURER";
    await saveSession(session);
    await provider.sendText(
      phone,
      `I'm sorry to hear that. I'm here to help you through this. 🙏\n\nFirst — which *insurance company* covers this vehicle?`
    );
    await provider.sendButtons(phone, "", [
      { id: "old_mutual",     title: "Old Mutual" },
      { id: "cell_insurance", title: "Cell Insurance" },
      { id: "zimnat",         title: "Zimnat" },
      { id: "nicoz_diamond",  title: "NICOZ Diamond" },
      { id: "allied",         title: "Allied Insurance" },
      { id: "alliance",       title: "Alliance Insurance" },
      { id: "other",          title: "Other insurer" },
    ]);
    return;
  }

  if (intent === "quote") {
    session.intent = "QUOTE";
    session.state = "QUOTE_PRODUCT";
    await saveSession(session);
    await provider.sendText(
      phone,
      `No commitment required — I just need a few details to get you a quote. 🛡️\n\nWhat type of insurance are you looking for?`
    );
    await provider.sendButtons(phone, "", [
      { id: "motor",       title: "Motor Insurance" },
      { id: "property",    title: "Property / Home" },
      { id: "engineering", title: "Engineering / Plant" },
      { id: "bonds",       title: "Bonds / Guarantees" },
      { id: "personal",    title: "Personal / Travel" },
    ]);
    return;
  }

  if (intent === "valuation") {
    session.intent = "VALUATION";
    session.state = "VALUATION_REG";
    await saveSession(session);
    await provider.sendText(
      phone,
      `I can arrange a professional KINGA valuation. 📊\n\nThis gives you an accurate market value for insurance and financing purposes.\n\nWhat is the *registration number* of the vehicle?`
    );
    return;
  }
}

async function routeActiveSession(
  session: Session,
  msg: IncomingMessage,
  provider: IWhatsAppProvider
): Promise<void> {
  const phone = session.phoneNumber;
  const state = session.state;

  // ── Claim journey ──────────────────────────────────────────────────────────
  if (state.startsWith("CLAIM_") || state === "AWAITING_DOCS") {

    // Handle document upload in AWAITING_DOCS state
    if (state === "AWAITING_DOCS" && msg.mediaUrl) {
      await provider.sendText(
        phone,
        `✅ Document received. Thank you.\n\nYour claim agent will review and attach it to your claim.\n\nReply *status* for a claim update.`
      );
      return;
    }

    const result = await handleClaimState(session, msg, provider);

    // Handle submission
    if (result.nextState === "CLAIM_SUBMITTED" || result.responseText === "__SUBMIT__") {
      await submitClaimToDb(session, phone, provider);
      return;
    }

    // Update session
    if (result.dataUpdate) {
      session.data = { ...(session.data as object), ...result.dataUpdate };
    }
    if (result.photoUrlsUpdate) {
      session.photoUrls = result.photoUrlsUpdate;
    }
    session.state = result.nextState as Session["state"];
    await saveSession(session);

    // Send response
    if (result.responseText && result.responseText !== "__SUBMIT__") {
      await provider.sendText(phone, result.responseText);
    }
    if (result.responseButtons?.length) {
      await provider.sendButtons(phone, "", result.responseButtons);
    }
    return;
  }

  // ── Quote journey ──────────────────────────────────────────────────────────
  if (state.startsWith("QUOTE_")) {
    const result = await handleQuoteState(session, msg, provider);
    if (result.dataUpdate) session.data = { ...(session.data as object), ...result.dataUpdate };
    session.state = result.nextState as Session["state"];
    await saveSession(session);
    if (result.responseText) await provider.sendText(phone, result.responseText);
    if (result.responseButtons?.length) await provider.sendButtons(phone, "", result.responseButtons);
    return;
  }

  // ── Valuation journey ──────────────────────────────────────────────────────
  if (state.startsWith("VALUATION_")) {
    const result = await handleValuationState(session, msg, provider);
    if (result.dataUpdate) session.data = { ...(session.data as object), ...result.dataUpdate };
    if (result.photoUrlsUpdate) session.photoUrls = result.photoUrlsUpdate;
    session.state = result.nextState as Session["state"];
    await saveSession(session);
    if (result.responseText) await provider.sendText(phone, result.responseText);
    return;
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  await provider.sendText(phone, `Hi there 👋\n\nHow can I help you today?`);
  await provider.sendButtons(phone, "", GREETING_BUTTONS);
}

// ─── Write Claim to DB ────────────────────────────────────────────────────────

async function submitClaimToDb(
  session: Session,
  phone: string,
  provider: IWhatsAppProvider
): Promise<void> {
  const data = session.data as ClaimSessionData;
  try {
    const actor = await resolveWhatsAppCanonicalActor(phone, data.insurerName);
    const result = await submitAndStartCanonicalIntake({ persist: persistCanonicalClaimIntake, startAssessment: startCanonicalIntakeAssessment }, actor, {
      idempotencyKey: session.id,
      channel: "whatsapp",
      claimantPhone: phone,
      vehicleRegistration: data.vehicleRegistration ?? "",
      vehicleMake: data.vehicleMake ?? "",
      vehicleModel: data.vehicleModel ?? "",
      vehicleYear: data.vehicleYear ? parseInt(data.vehicleYear, 10) : undefined,
      incidentDate: data.incidentDate ?? new Date().toISOString().slice(0, 10),
      incidentLocation: data.incidentLocation ?? "",
      incidentDescription: data.incidentDescription ?? "",
      incidentType: (data.incidentType as any) ?? "other",
      policeReportNumber: data.policeOfficerDetails,
      attachments: (data.attachments ?? []) as any,
      repairerPreferences: [],
      sourceMetadata: { insurerName: data.insurerName, driverIsSelf: data.driverIsSelf, driverName: data.driverName, driverLicenceNumber: data.driverLicenceNumber, licenceAgeRange: data.licenceAgeRange, roadSurface: data.roadSurface, weatherConditions: data.weatherConditions, gpsLat: data.gpsLat, gpsLng: data.gpsLng, policeAttended: data.policeAttended, waSessionId: session.id, waPhoneNumber: phone },
    });

    /* Legacy persistence shape retained below for historical reference only.
    await (await getDbOrThrow()).insert(claims).values({
      claimNumber,
      status: "submitted" as any,
      claimSource: "whatsapp",
      vehicleRegistration: data.vehicleRegistration,
      vehicleMake: data.vehicleMake,
      vehicleModel: data.vehicleModel,
      vehicleYear: data.vehicleYear ? parseInt(data.vehicleYear) : undefined,
      incidentDate: data.incidentDate,
      incidentType: (data.incidentType as any) ?? "other",
      incidentDescription: data.incidentDescription,
      incidentLocation: data.incidentLocation,
      policeReportNumber: data.policeOfficerDetails,
      supportingDocuments: JSON.stringify(session.photoUrls ?? []),
      metadata: JSON.stringify({
        insurerName: data.insurerName,
        driverIsSelf: data.driverIsSelf,
        driverName: data.driverName,
        driverLicenceNumber: data.driverLicenceNumber,
        licenceAgeRange: data.licenceAgeRange,
        licencePhotoUrl: data.licencePhotoUrl,
        roadSurface: data.roadSurface,
        weatherConditions: data.weatherConditions,
        gpsLat: data.gpsLat,
        gpsLng: data.gpsLng,
        policeAttended: data.policeAttended,
        waSessionId: session.id,
        waPhoneNumber: phone,
      }),
      createdAt: now,
      updatedAt: now,
    } as any); */

    await applyWhatsAppSubmissionSideEffects(session, phone, provider, result, { saveSession });

  } catch (err) {
    console.error("[WA] Failed to write claim to DB:", err);
    await provider.sendText(
      phone,
      `I'm sorry — there was a problem submitting your claim. Please try again or contact us directly.\n\nYour information has been saved.`
    );
  }
}
