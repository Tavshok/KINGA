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
import { claims } from "../../drizzle/schema";
import type { ClaimSessionData } from "./types";

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
    const claimNumber = `KNG-WA-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");

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
    } as any);

    // Update session
    session.state = "AWAITING_DOCS";
    session.status = "submitted";
    await saveSession(session);

    // Send success message
    await provider.sendText(
      phone,
      `✅ *Claim Submitted*\n\n` +
      `📋 Reference: *${claimNumber}*\n\n` +
      `An assessor will contact you within *24 hours* to arrange a vehicle inspection.\n\n` +
      `Reply *status* any time for an update, or view your claim at kinga.ai/client`
    );

    // Send follow-up document request
    setTimeout(async () => {
      try {
        await provider.sendText(
          phone,
          `📋 *Two documents will be needed to finalise your claim:*\n\n` +
          `1️⃣ *Police report* — once issued\n` +
          `2️⃣ *Vehicle registration book* (logbook)\n\n` +
          `You can send them here on WhatsApp by replying with a photo, or upload at *kinga.ai/client*\n\n` +
          `💡 Register on the portal to track your claim and receive your assessment report → *kinga.ai/client*`
        );
      } catch (e) { /* ignore */ }
    }, 3000);

  } catch (err) {
    console.error("[WA] Failed to write claim to DB:", err);
    await provider.sendText(
      phone,
      `I'm sorry — there was a problem submitting your claim. Please try again or contact us directly.\n\nYour information has been saved.`
    );
  }
}
