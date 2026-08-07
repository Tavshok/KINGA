/**
 * WhatsApp — Status, Quote, and Valuation Journey Handlers
 */

import type { Session } from "./sessionManager";
import type { IWhatsAppProvider, WaButton } from "./provider";
import type { QuoteSessionData, ValuationSessionData, IncomingMessage } from "./types";
import { getDbOrThrow } from "../db";
import { claims, quotationRequests } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

// ─── Status Journey ───────────────────────────────────────────────────────────

const CLAIM_STATUS_LABELS: Record<string, { label: string; explanation: string; timeframe: string }> = {
  submitted:           { label: "Received",        explanation: "Your claim has been received and is in the queue.", timeframe: "Assessment begins within 24 hours." },
  intake_pending:      { label: "Received",        explanation: "Your claim has been received and is in the queue.", timeframe: "Assessment begins within 24 hours." },
  in_review:           { label: "Under Review",    explanation: "A KINGA assessor is reviewing your claim details.", timeframe: "You will hear from us within 24–48 hours." },
  ai_complete:         { label: "Being Assessed",  explanation: "KINGA has completed its analysis. Your assessor is reviewing.", timeframe: "Decision expected within 24 hours." },
  assessment_in_progress: { label: "Being Assessed", explanation: "Your assessor is reviewing the damage assessment.", timeframe: "Decision expected within 24 hours." },
  pending_quotes:      { label: "Awaiting Repair Quotes", explanation: "We are collecting repair quotes from approved panel beaters.", timeframe: "Quotes expected within 48 hours." },
  quotes_received:     { label: "Quotes Received", explanation: "Repair quotes have been received and are being reviewed.", timeframe: "Authorisation decision within 24 hours." },
  approved:            { label: "Approved",        explanation: "Your claim has been approved. Repairs can proceed.", timeframe: "Contact your panel beater to schedule." },
  rejected:            { label: "Not Approved",    explanation: "Your claim was not approved. You will receive a letter explaining why.", timeframe: "Contact your insurer for more information." },
  settled:             { label: "Settled",         explanation: "Your claim has been settled and payment processed.", timeframe: "Allow 3–5 business days for funds to reflect." },
  closed:              { label: "Closed",          explanation: "Your claim has been closed.", timeframe: "" },
};

export async function handleStatusJourney(
  phoneNumber: string,
  provider: IWhatsAppProvider
): Promise<void> {
  // Look up most recent active claim by phone number
  const db = await getDbOrThrow();
  const rows = await db
    .select({
      claimNumber: claims.claimNumber,
      status: claims.status,
      vehicleRegistration: claims.vehicleRegistration,
      vehicleMake: claims.vehicleMake,
      vehicleModel: claims.vehicleModel,
      incidentDate: claims.incidentDate,
    })
    .from(claims)
    .where(eq(claims.claimantPhone, phoneNumber))
    .orderBy(desc(claims.createdAt))
    .limit(3);

  if (!rows.length) {
    await provider.sendText(
      phoneNumber,
      "I couldn't find any claims linked to this number.\n\n" +
      "If you submitted a claim through a different channel, please contact your insurer directly.\n\n" +
      "To submit a new claim, reply *Hi* and choose *Report an accident*."
    );
    return;
  }

  const claim = rows[0];
  const statusInfo = CLAIM_STATUS_LABELS[claim.status ?? "submitted"] ?? {
    label: claim.status ?? "In Progress",
    explanation: "Your claim is being processed.",
    timeframe: "",
  };

  const vehicle = [claim.vehicleMake, claim.vehicleModel, claim.vehicleRegistration ? `(${claim.vehicleRegistration})` : ""].filter(Boolean).join(" ");
  const dateStr = claim.incidentDate ? new Date(claim.incidentDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

  let text = `🔍 *Claim Status*\n\n`;
  text += `📋 ${claim.claimNumber}\n`;
  if (vehicle) text += `🚗 ${vehicle}\n`;
  if (dateStr) text += `📅 Incident: ${dateStr}\n`;
  text += `\n*Status: ${statusInfo.label}*\n`;
  text += `${statusInfo.explanation}\n`;
  if (statusInfo.timeframe) text += `⏱ ${statusInfo.timeframe}\n`;
  text += `\nReply *Hi* for more options or to submit another claim.`;

  await provider.sendText(phoneNumber, text);
}

// ─── Quote Journey ────────────────────────────────────────────────────────────

const PRODUCT_CATEGORIES: WaButton[] = [
  { id: "motor",       title: "Motor Insurance" },
  { id: "property",    title: "Property / Home" },
  { id: "engineering", title: "Engineering / Plant" },
  { id: "bonds",       title: "Bonds / Guarantees" },
  { id: "personal",    title: "Personal / Travel" },
];

const MOTOR_COVER_TYPES: WaButton[] = [
  { id: "comprehensive", title: "Comprehensive" },
  { id: "third_party",   title: "Third Party Only" },
  { id: "tpft",          title: "Third Party Fire & Theft" },
];

function matchBtn(input: string, buttons: WaButton[]): WaButton | null {
  const t = input.trim().toLowerCase();
  return buttons.find(b => b.title.toLowerCase() === t)
    ?? buttons.find(b => b.id === t)
    ?? ((!isNaN(parseInt(t)) && parseInt(t) >= 1 && parseInt(t) <= buttons.length) ? buttons[parseInt(t) - 1] : null)
    ?? buttons.find(b => b.title.toLowerCase().includes(t))
    ?? null;
}

export async function handleQuoteState(
  session: Session,
  msg: IncomingMessage,
  _provider: IWhatsAppProvider
): Promise<{ nextState: Session["state"]; dataUpdate?: Partial<QuoteSessionData>; responseText?: string; responseButtons?: WaButton[] }> {
  const data = (session.data as QuoteSessionData) ?? {};
  const input = msg.body?.trim() ?? "";

  switch (session.state) {
    case "QUOTE_PRODUCT": {
      const btn = matchBtn(input, PRODUCT_CATEGORIES);
      if (!btn) return { nextState: "QUOTE_PRODUCT", responseText: "Please choose a product category:", responseButtons: PRODUCT_CATEGORIES };
      if (btn.id === "motor") {
        return { nextState: "QUOTE_COVER_TYPE", dataUpdate: { productCategory: btn.id }, responseText: "What type of motor cover are you looking for?", responseButtons: MOTOR_COVER_TYPES };
      }
      return { nextState: "QUOTE_REGISTRATION", dataUpdate: { productCategory: btn.id }, responseText: `Got it — *${btn.title}*.\n\nWhat is the registration number of the vehicle or asset to be insured?` };
    }
    case "QUOTE_COVER_TYPE": {
      const btn = matchBtn(input, MOTOR_COVER_TYPES);
      if (!btn) return { nextState: "QUOTE_COVER_TYPE", responseText: "Please choose a cover type:", responseButtons: MOTOR_COVER_TYPES };
      return { nextState: "QUOTE_REGISTRATION", dataUpdate: { insuranceType: btn.id }, responseText: `Got it — *${btn.title}*.\n\nWhat is the *registration number* of the vehicle?` };
    }
    case "QUOTE_REGISTRATION": {
      if (input.length < 3) return { nextState: "QUOTE_REGISTRATION", responseText: "Please enter the registration number." };
      const reg = input.toUpperCase();
      return { nextState: "QUOTE_VEHICLE_MAKE", dataUpdate: { vehicleRegistration: reg }, responseText: `What is the *make and model* of the vehicle? (e.g. Toyota Corolla)` };
    }
    case "QUOTE_VEHICLE_MAKE": {
      if (input.length < 2) return { nextState: "QUOTE_VEHICLE_MAKE", responseText: "Please enter the make and model." };
      const parts = input.split(/\s+/);
      return { nextState: "QUOTE_VEHICLE_YEAR", dataUpdate: { vehicleMake: parts[0], vehicleModel: parts.slice(1).join(" ") || parts[0] }, responseText: "And what *year* is it?" };
    }
    case "QUOTE_VEHICLE_YEAR": {
      const year = parseInt(input, 10);
      if (isNaN(year) || year < 1970) return { nextState: "QUOTE_VEHICLE_YEAR", responseText: "Please enter a valid year (e.g. 2020)." };
      return {
        nextState: "QUOTE_SUBMITTED",
        dataUpdate: { vehicleYear: String(year) },
        responseText:
          `✅ *Quote Request Received*\n\n` +
          `🚗 ${data.vehicleMake} ${data.vehicleModel} ${year} (${data.vehicleRegistration})\n` +
          `🛡️ ${data.productCategory === "motor" ? data.insuranceType?.replace("_", " ") : data.productCategory}\n\n` +
          `A KINGA agent will prepare your quote and send it to you within *1 business day*.\n\n` +
          `No commitment required — you can accept or decline when you receive it.\n\n` +
          `Reply *Hi* for more options.`,
      };
    }
    default:
      return { nextState: "GREETING", responseText: "Something went wrong. Reply *Hi* to start again." };
  }
}

// ─── Valuation Journey ────────────────────────────────────────────────────────

export async function handleValuationState(
  session: Session,
  msg: IncomingMessage,
  provider: IWhatsAppProvider
): Promise<{ nextState: Session["state"]; dataUpdate?: Partial<ValuationSessionData>; photoUrlsUpdate?: string[]; responseText?: string }> {
  const data = (session.data as ValuationSessionData) ?? {};
  const input = msg.body?.trim() ?? "";

  switch (session.state) {
    case "VALUATION_REG": {
      if (input.length < 3) return { nextState: "VALUATION_REG", responseText: "Please enter the vehicle registration number." };
      const reg = input.toUpperCase();
      return { nextState: "VALUATION_VEHICLE_MAKE", dataUpdate: { vehicleRegistration: reg }, responseText: `What is the *make and model* of *${reg}*? (e.g. Toyota Corolla)` };
    }
    case "VALUATION_VEHICLE_MAKE": {
      if (input.length < 2) return { nextState: "VALUATION_VEHICLE_MAKE", responseText: "Please enter the make and model." };
      const parts = input.split(/\s+/);
      return { nextState: "VALUATION_VEHICLE_YEAR", dataUpdate: { vehicleMake: parts[0], vehicleModel: parts.slice(1).join(" ") || parts[0] }, responseText: "And what *year* is it?" };
    }
    case "VALUATION_VEHICLE_YEAR": {
      const year = parseInt(input, 10);
      if (isNaN(year) || year < 1970) return { nextState: "VALUATION_VEHICLE_YEAR", responseText: "Please enter a valid year (e.g. 2018)." };
      return {
        nextState: "VALUATION_MILEAGE",
        dataUpdate: { vehicleYear: String(year) },
        responseText: `Got it — *${data.vehicleMake} ${data.vehicleModel} ${year}*.\n\nWhat is the *approximate mileage* (km)?\n\n_(Mileage helps us give you a more accurate valuation.)_`,
      };
    }
    case "VALUATION_MILEAGE": {
      const mileage = input.replace(/[^0-9]/g, "");
      if (!mileage) return { nextState: "VALUATION_MILEAGE", responseText: "Please enter the approximate mileage in kilometres (e.g. 85000)." };
      return {
        nextState: "VALUATION_PHOTOS",
        dataUpdate: { mileage },
        responseText:
          `Please send *4 photos* of the vehicle:\n\n` +
          `📸 *1.* Front\n📸 *2.* Rear\n📸 *3.* Left side\n📸 *4.* Right side\n\n` +
          `Clear photos help us provide the most accurate valuation.`,
      };
    }
    case "VALUATION_PHOTOS": {
      const currentPhotos = session.photoUrls ?? [];
      if (msg.mediaUrl) {
        let photoUrl = msg.mediaUrl;
        try {
          const { storagePut } = await import("../storage");
          const buffer = await provider.downloadMedia(msg.mediaUrl);
          const key = `whatsapp-valuations/${data.vehicleRegistration}-${Date.now()}.jpg`;
          const result = await storagePut(key, buffer, msg.mediaType ?? "image/jpeg");
          photoUrl = result.url;
        } catch (e) { console.error("[WA] Valuation photo upload failed:", e); }
        const updated = [...currentPhotos, photoUrl];
        if (updated.length < 4) {
          return { nextState: "VALUATION_PHOTOS", photoUrlsUpdate: updated, dataUpdate: { photoUrls: updated }, responseText: `✅ Photo ${updated.length} received. ${4 - updated.length} more to go.` };
        }
        return {
          nextState: "VALUATION_SUBMITTED",
          photoUrlsUpdate: updated,
          dataUpdate: { photoUrls: updated },
          responseText:
            `✅ *Valuation Request Received*\n\n` +
            `🚗 ${data.vehicleMake} ${data.vehicleModel} ${data.vehicleYear} (${data.vehicleRegistration})\n` +
            `📏 Mileage: ${data.mileage} km\n📸 Photos: ${updated.length} received\n\n` +
            `Your valuation report will be delivered to you within *24 hours* — here on WhatsApp and in your portal at kinga.ai/client\n\n` +
            `Reply *Hi* for more options.`,
        };
      }
      return { nextState: "VALUATION_PHOTOS", responseText: currentPhotos.length === 0 ? "Please send the 4 vehicle photos (Front, Rear, Left, Right)." : `${currentPhotos.length} photo(s) received. Keep sending.` };
    }
    default:
      return { nextState: "GREETING", responseText: "Something went wrong. Reply *Hi* to start again." };
  }
}
