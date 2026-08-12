/**
 * WhatsApp Claim Journey Handler
 * ──────────────────────────────
 * Handles all CLAIM_* states. Each handler receives the current session and
 * the incoming message, updates session data, advances the state, and returns
 * the response to send back to the client.
 */

import type { Session } from "./sessionManager";
import type { IWhatsAppProvider, WaButton } from "./provider";
import type { ClaimSessionData, IncomingMessage } from "./types";
import {
  INSURERS, ROAD_SURFACES, WEATHER_CONDITIONS,
  INCIDENT_TYPES, LICENCE_AGE_RANGES,
} from "./types";
import { storagePut } from "../storage";
import { randomUUID } from "crypto";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function insurerButtons(): WaButton[] {
  return INSURERS.map(i => ({ id: i.id, title: i.label }));
}

function roadSurfaceButtons(): WaButton[] {
  return ROAD_SURFACES.map(r => ({ id: r.id, title: r.label }));
}

function weatherButtons(): WaButton[] {
  return WEATHER_CONDITIONS.map(w => ({ id: w.id, title: w.label }));
}

function incidentTypeButtons(): WaButton[] {
  return INCIDENT_TYPES.map(t => ({ id: t.id, title: t.label }));
}

function licenceAgeButtons(): WaButton[] {
  return LICENCE_AGE_RANGES.map(a => ({ id: a.id, title: a.label }));
}

/** Match a numbered reply (e.g. "1", "2") or label text to a button */
function matchButton(input: string, buttons: WaButton[]): WaButton | null {
  const trimmed = input.trim().toLowerCase();
  // Exact label match
  const byLabel = buttons.find(b => b.title.toLowerCase() === trimmed);
  if (byLabel) return byLabel;
  // Numbered reply
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= buttons.length) return buttons[num - 1];
  // Partial match
  return buttons.find(b => b.title.toLowerCase().includes(trimmed)) ?? null;
}

/** Upload media and retain immutable provenance needed by canonical intake. */
async function uploadPhotoToS3(
  buffer: Buffer,
  mimeType: string,
  prefix: string
): Promise<{ key: string; url: string; fileName: string; fileSize: number; mimeType: string }> {
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] ?? "bin";
  const key = `whatsapp-claims/${prefix}-${randomUUID()}.${ext}`;
  const { url } = await storagePut(key, buffer, mimeType);
  return { key, url, fileName: `${prefix}.${ext}`, fileSize: buffer.length, mimeType };
}

/** Build the confirm summary card text */
function buildConfirmText(data: ClaimSessionData): string {
  const lines = [
    `📋 *Claim Summary*\n`,
    `🏢 Insurer: ${data.insurerName ?? "—"}`,
    `🚗 Vehicle: ${data.vehicleMake} ${data.vehicleModel} ${data.vehicleYear} (${data.vehicleRegistration})`,
    `👤 Driver: ${data.driverIsSelf ? "Owner (self)" : data.driverName ?? "—"}`,
    `🪪 Licence: ${data.driverLicenceNumber ?? "—"} · ${data.licenceAgeRange?.replace(/_/g, " ") ?? "—"}`,
    `📅 Date: ${data.incidentDate ?? "—"}`,
    `💥 Incident: ${INCIDENT_TYPES.find(t => t.id === data.incidentType)?.label ?? data.incidentType ?? "—"}`,
    `🛣️ Road: ${ROAD_SURFACES.find(r => r.id === data.roadSurface)?.label ?? data.roadSurface ?? "—"}`,
    `🌤️ Weather: ${WEATHER_CONDITIONS.find(w => w.id === data.weatherConditions)?.label ?? data.weatherConditions ?? "—"}`,
    `📍 Location: ${data.incidentLocation ?? "—"}`,
    `👮 Officer: ${data.policeOfficerDetails ?? (data.policeAttended === false ? "Not yet reported" : "—")}`,
    `📸 Photos: ${(data.vehiclePhotoUrls?.length ?? 0) + (data.licencePhotoUrl ? 1 : 0)} received`,
    `\nReady to submit?`,
  ];
  return lines.join("\n");
}

// ─── State Handlers ───────────────────────────────────────────────────────────

export type JourneyResult = {
  nextState: Session["state"];
  dataUpdate?: Partial<ClaimSessionData>;
  photoUrlsUpdate?: string[];
  attachmentsUpdate?: ClaimSessionData["attachments"];
  responseText?: string;
  responseButtons?: WaButton[];
  /** If set, send this text AFTER the buttons */
  followUpText?: string;
};

export async function handleClaimState(
  session: Session,
  msg: IncomingMessage,
  provider: IWhatsAppProvider
): Promise<JourneyResult> {
  const data = (session.data as ClaimSessionData) ?? {};
  const input = msg.body?.trim() ?? "";

  switch (session.state) {

    // ── INSURER ──────────────────────────────────────────────────────────────
    case "CLAIM_INSURER": {
      const btn = matchButton(input, insurerButtons());
      if (!btn) {
        return {
          nextState: "CLAIM_INSURER",
          responseText: "Please choose your insurer from the list:",
          responseButtons: insurerButtons(),
        };
      }
      return {
        nextState: "CLAIM_SAFETY_INJURIES",
        dataUpdate: { insurerName: btn.title },
        responseText: `Got it — *${btn.title}*. ✅\n\nIs anyone injured?`,
        responseButtons: [
          { id: "safe", title: "No injuries — everyone is safe" },
          { id: "injured", title: "Yes — someone is injured" },
        ],
      };
    }

    // ── SAFETY: INJURIES ─────────────────────────────────────────────────────
    case "CLAIM_SAFETY_INJURIES": {
      const lower = input.toLowerCase();
      const injured = lower.includes("injur") || lower.includes("yes") || input === "2";
      if (injured) {
        return {
          nextState: "CLAIM_INJURY_PATH",
          dataUpdate: { injuryFlag: true },
          responseText:
            "Please make sure everyone gets the care they need first. 🙏\n\n" +
            "🚑 *Emergency: [emergency number]*\n" +
            "🚔 *Police: [police number]*\n\n" +
            "Your claim can wait — *people cannot.*\n\n" +
            "Come back when everyone is safe and I will help you complete your claim. I have saved your session.",
          responseButtons: [
            { id: "agent", title: "Connect me to an agent now" },
            { id: "later", title: "Thank you — I'll come back later" },
          ],
        };
      }
      return {
        nextState: "CLAIM_SAFETY_VEHICLE",
        dataUpdate: { injuryFlag: false },
        responseText: "Good to hear. 🙏\n\nIs your vehicle in a safe position — off the road or away from traffic?",
        responseButtons: [
          { id: "safe", title: "Yes, vehicle is safe" },
          { id: "blocking", title: "No — it is blocking traffic" },
        ],
      };
    }

    // ── INJURY PATH ───────────────────────────────────────────────────────────
    case "CLAIM_INJURY_PATH": {
      // Client has returned — resume
      return {
        nextState: "CLAIM_SAFETY_VEHICLE",
        responseText: "Welcome back. I hope everyone is safe. 🙏\n\nLet's continue with your claim.\n\nIs your vehicle in a safe position?",
        responseButtons: [
          { id: "safe", title: "Yes, vehicle is safe" },
          { id: "blocking", title: "No — it is blocking traffic" },
        ],
      };
    }

    // ── SAFETY: VEHICLE ───────────────────────────────────────────────────────
    case "CLAIM_SAFETY_VEHICLE": {
      const blocking = input.toLowerCase().includes("block") || input === "2";
      return {
        nextState: "CLAIM_POLICE",
        dataUpdate: { vehicleBlocking: blocking },
        responseText: blocking
          ? "Understood — please move to safety if possible. An agent has been flagged.\n\nDid the police attend the scene?"
          : "Good. Did the police attend the scene?",
        responseButtons: [
          { id: "yes", title: "Yes — police attended" },
          { id: "later", title: "Not yet — I will report later" },
          { id: "no", title: "No police involvement" },
        ],
      };
    }

    // ── POLICE ────────────────────────────────────────────────────────────────
    case "CLAIM_POLICE": {
      const lower = input.toLowerCase();
      const attended = lower.includes("yes") || lower.includes("attended") || input === "1";
      const noPolice = lower.includes("no police") || input === "3";
      const policeAttended = attended ? true : noPolice ? false : null;

      if (attended) {
        return {
          nextState: "CLAIM_POLICE_OFFICER",
          dataUpdate: { policeAttended: true },
          responseText: "Can you share the *attending officer's name or badge number*? (Optional — reply *skip* if you don't have it)",
        };
      }
      return {
        nextState: "CLAIM_REGISTRATION",
        dataUpdate: { policeAttended },
        responseText: "Understood — you can upload the police report later.\n\nWhat is the *registration number* of your vehicle?",
      };
    }

    // ── POLICE OFFICER ────────────────────────────────────────────────────────
    case "CLAIM_POLICE_OFFICER": {
      const skip = input.toLowerCase() === "skip" || input.toLowerCase() === "no";
      return {
        nextState: "CLAIM_REGISTRATION",
        dataUpdate: { policeOfficerDetails: skip ? undefined : input },
        responseText: "Thank you.\n\nWhat is the *registration number* of your vehicle?",
      };
    }

    // ── REGISTRATION ──────────────────────────────────────────────────────────
    case "CLAIM_REGISTRATION": {
      if (input.length < 3) {
        return {
          nextState: "CLAIM_REGISTRATION",
          responseText: "Please enter your vehicle registration number (e.g. ABC 1234).",
        };
      }
      const reg = input.toUpperCase();
      // TODO: lookup in KINGA vehicle registry
      // For now, treat all as unknown and collect details
      return {
        nextState: "CLAIM_VEHICLE_MAKE",
        dataUpdate: { vehicleRegistration: reg, vehicleKnown: false },
        responseText: `Thank you. I don't have *${reg}* on record yet — no problem, I'll collect the details now.\n\nWhat is the *make and model* of your vehicle? (e.g. Toyota Corolla)`,
      };
    }

    // ── VEHICLE MAKE ──────────────────────────────────────────────────────────
    case "CLAIM_VEHICLE_MAKE": {
      if (input.length < 3) {
        return { nextState: "CLAIM_VEHICLE_MAKE", responseText: "Please enter the make and model (e.g. Toyota Corolla)." };
      }
      // Try to split make and model
      const parts = input.split(/\s+/);
      const make = parts[0];
      const model = parts.slice(1).join(" ") || parts[0];
      return {
        nextState: "CLAIM_VEHICLE_YEAR",
        dataUpdate: { vehicleMake: make, vehicleModel: model },
        responseText: `Got it — *${input}*. What *year* is it?`,
      };
    }

    // ── VEHICLE YEAR ──────────────────────────────────────────────────────────
    case "CLAIM_VEHICLE_YEAR": {
      const year = parseInt(input, 10);
      if (isNaN(year) || year < 1970 || year > new Date().getFullYear() + 1) {
        return { nextState: "CLAIM_VEHICLE_YEAR", responseText: `Please enter a valid year (e.g. 2019).` };
      }
      return {
        nextState: "CLAIM_DRIVER_SELF",
        dataUpdate: { vehicleYear: String(year) },
        responseText: `Got it — *${data.vehicleMake} ${data.vehicleModel} ${year}*. ✅\n\nWere *you* the driver at the time of the incident?`,
        responseButtons: [
          { id: "self", title: "Yes — I was driving" },
          { id: "other", title: "No — someone else was driving" },
        ],
      };
    }

    // ── DRIVER SELF ───────────────────────────────────────────────────────────
    case "CLAIM_DRIVER_SELF": {
      const isSelf = input.toLowerCase().includes("yes") || input.toLowerCase().includes("i was") || input === "1";
      if (!isSelf) {
        return {
          nextState: "CLAIM_DRIVER_NAME",
          dataUpdate: { driverIsSelf: false },
          responseText: "Please share the *full name of the driver* at the time of the incident.",
        };
      }
      return {
        nextState: "CLAIM_LICENCE_NUMBER",
        dataUpdate: { driverIsSelf: true },
        responseText: "Please share your *driver's licence number*.",
      };
    }

    // ── DRIVER NAME ───────────────────────────────────────────────────────────
    case "CLAIM_DRIVER_NAME": {
      if (input.length < 3) {
        return { nextState: "CLAIM_DRIVER_NAME", responseText: "Please enter the driver's full name." };
      }
      return {
        nextState: "CLAIM_LICENCE_NUMBER",
        dataUpdate: { driverName: input },
        responseText: `Got it — *${input}*.\n\nPlease share their *driver's licence number*.`,
      };
    }

    // ── LICENCE NUMBER ────────────────────────────────────────────────────────
    case "CLAIM_LICENCE_NUMBER": {
      if (input.length < 4) {
        return { nextState: "CLAIM_LICENCE_NUMBER", responseText: "Please enter the driver's licence number." };
      }
      return {
        nextState: "CLAIM_LICENCE_AGE",
        dataUpdate: { driverLicenceNumber: input.toUpperCase() },
        responseText: "How long have they held their driver's licence?",
        responseButtons: licenceAgeButtons(),
      };
    }

    // ── LICENCE AGE ───────────────────────────────────────────────────────────
    case "CLAIM_LICENCE_AGE": {
      const btn = matchButton(input, licenceAgeButtons());
      if (!btn) {
        return { nextState: "CLAIM_LICENCE_AGE", responseText: "Please choose how long they have held their licence:", responseButtons: licenceAgeButtons() };
      }
      return {
        nextState: "CLAIM_LICENCE_PHOTO",
        dataUpdate: { licenceAgeRange: btn.id },
        responseText: "Please send a *photo of the driver's licence* (front side).",
      };
    }

    // ── LICENCE PHOTO ─────────────────────────────────────────────────────────
    case "CLAIM_LICENCE_PHOTO": {
      if (!msg.mediaUrl) {
        return { nextState: "CLAIM_LICENCE_PHOTO", responseText: "Please send a photo of the driver's licence (front side)." };
      }
      // A claim must not advance until the licence image is durably stored.
      let licencePhotoUrl: string;
      let licenceAttachment: NonNullable<ClaimSessionData["attachments"]>[number];
      try {
        const buffer = await provider.downloadMedia(msg.mediaUrl);
        const uploaded = await uploadPhotoToS3(buffer, msg.mediaType ?? "image/jpeg", "licence");
        licencePhotoUrl = uploaded.url;
        licenceAttachment = { ...uploaded, category: "other" };
      } catch (e) {
        console.error("[WA] Licence photo upload failed:", e);
        return { nextState: "CLAIM_LICENCE_PHOTO", responseText: "I could not save that licence image securely. Please send it again." };
      }
      return {
        nextState: "CLAIM_DATE",
        dataUpdate: { licencePhotoUrl, attachments: [...(data.attachments ?? []), licenceAttachment!] },
        responseText: "✅ Licence received. Thank you.\n\nWhen did the incident happen?",
        responseButtons: [
          { id: "today", title: "Today" },
          { id: "yesterday", title: "Yesterday" },
          { id: "other", title: "Another date" },
        ],
      };
    }

    // ── DATE ──────────────────────────────────────────────────────────────────
    case "CLAIM_DATE": {
      const lower = input.toLowerCase();
      let incidentDate: string;
      const today = new Date();
      if (lower.includes("today") || input === "1") {
        incidentDate = today.toISOString().slice(0, 10);
      } else if (lower.includes("yesterday") || input === "2") {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        incidentDate = y.toISOString().slice(0, 10);
      } else {
        // Accept any date-like string
        incidentDate = input;
      }
      return {
        nextState: "CLAIM_INCIDENT_TYPE",
        dataUpdate: { incidentDate },
        responseText: "What type of incident was it?",
        responseButtons: incidentTypeButtons(),
      };
    }

    // ── INCIDENT TYPE ─────────────────────────────────────────────────────────
    case "CLAIM_INCIDENT_TYPE": {
      const btn = matchButton(input, incidentTypeButtons());
      if (!btn) {
        return { nextState: "CLAIM_INCIDENT_TYPE", responseText: "Please choose the type of incident:", responseButtons: incidentTypeButtons() };
      }
      const typeInfo = INCIDENT_TYPES.find(t => t.id === btn.id)!;
      return {
        nextState: "CLAIM_DESCRIPTION",
        dataUpdate: { incidentType: btn.id },
        responseText: typeInfo.prompt,
      };
    }

    // ── DESCRIPTION ───────────────────────────────────────────────────────────
    case "CLAIM_DESCRIPTION": {
      if (input.length < 10) {
        return { nextState: "CLAIM_DESCRIPTION", responseText: "Please describe what happened in a bit more detail." };
      }
      return {
        nextState: "CLAIM_ROAD_SURFACE",
        dataUpdate: { incidentDescription: input },
        responseText: "Thank you — that is very helpful. ✅\n\nWhat was the *road surface* like at the time?",
        responseButtons: roadSurfaceButtons(),
      };
    }

    // ── ROAD SURFACE ──────────────────────────────────────────────────────────
    case "CLAIM_ROAD_SURFACE": {
      const btn = matchButton(input, roadSurfaceButtons());
      if (!btn) {
        return { nextState: "CLAIM_ROAD_SURFACE", responseText: "Please choose the road surface:", responseButtons: roadSurfaceButtons() };
      }
      return {
        nextState: "CLAIM_WEATHER",
        dataUpdate: { roadSurface: btn.id },
        responseText: "And what were the *weather conditions* at the time?",
        responseButtons: weatherButtons(),
      };
    }

    // ── WEATHER ───────────────────────────────────────────────────────────────
    case "CLAIM_WEATHER": {
      const btn = matchButton(input, weatherButtons());
      if (!btn) {
        return { nextState: "CLAIM_WEATHER", responseText: "Please choose the weather conditions:", responseButtons: weatherButtons() };
      }
      return {
        nextState: "CLAIM_LOCATION",
        dataUpdate: { weatherConditions: btn.id },
        responseText: "Got it. Where did it happen?\n\nYou can *share your location 📍* for the most accurate result, or type the area.",
      };
    }

    // ── LOCATION ──────────────────────────────────────────────────────────────
    case "CLAIM_LOCATION": {
      let location = input;
      let gpsLat: number | undefined;
      let gpsLng: number | undefined;

      if (msg.latitude && msg.longitude) {
        gpsLat = msg.latitude;
        gpsLng = msg.longitude;
        location = msg.locationAddress ?? `${gpsLat.toFixed(4)}, ${gpsLng.toFixed(4)}`;
      }

      if (!location || location.length < 2) {
        return { nextState: "CLAIM_LOCATION", responseText: "Please share your location or type the area where the incident happened." };
      }

      const photoCount = (data.vehiclePhotoUrls?.length ?? 0);
      return {
        nextState: "CLAIM_PHOTOS",
        dataUpdate: { incidentLocation: location, gpsLat, gpsLng },
        responseText:
          `📍 Location confirmed — *${location}*.\n\n` +
          `Please send me *6 photos* of the vehicle:\n\n` +
          `📸 *1.* Front\n📸 *2.* Rear\n📸 *3.* Left side\n📸 *4.* Right side\n` +
          `📸 *5.* Damage close-up (area 1)\n📸 *6.* Damage close-up (area 2)\n\n` +
          `Any quality is fine — send them one by one or all at once.`,
      };
    }

    // ── PHOTOS ────────────────────────────────────────────────────────────────
    case "CLAIM_PHOTOS": {
      const currentPhotos = session.photoUrls ?? [];

      if (msg.mediaUrl) {
        // A claim must not advance with a transient provider URL as evidence.
        let uploadedPhoto: { key: string; url: string; fileName: string; fileSize: number; mimeType: string };
        try {
          const buffer = await provider.downloadMedia(msg.mediaUrl);
          uploadedPhoto = await uploadPhotoToS3(buffer, msg.mediaType ?? "image/jpeg", "vehicle");
        } catch (e) {
          console.error("[WA] Vehicle photo upload failed:", e);
          return { nextState: "CLAIM_PHOTOS", responseText: "I could not save that photo securely. Please send it again." };
        }
        const updatedPhotos = [...currentPhotos, uploadedPhoto!.url];
        const updatedAttachments = [...(data.attachments ?? []), { ...uploadedPhoto!, category: "damage_photo" as const }];
        const count = updatedPhotos.length;

        if (count < 6) {
          return {
            nextState: "CLAIM_PHOTOS",
            photoUrlsUpdate: updatedPhotos,
            dataUpdate: { vehiclePhotoUrls: updatedPhotos, attachments: updatedAttachments },
            responseText: `✅ Photo ${count} received. ${6 - count} more to go.\n\nSend the next photo when ready.`,
          };
        } else {
          return {
            nextState: "CLAIM_CONFIRM",
            photoUrlsUpdate: updatedPhotos,
            dataUpdate: { vehiclePhotoUrls: updatedPhotos, attachments: updatedAttachments },
            responseText: `✅ All ${count} photos received.\n\n` + buildConfirmText({ ...data, vehiclePhotoUrls: updatedPhotos }),
            responseButtons: [
              { id: "submit", title: "Submit my claim" },
              { id: "change", title: "Change something" },
            ],
          };
        }
      }

      // Text message during photo collection — check if they want to skip
      const lower = input.toLowerCase();
      if ((lower.includes("done") || lower.includes("that") || lower.includes("all")) && currentPhotos.length >= 1) {
        return {
          nextState: "CLAIM_CONFIRM",
          dataUpdate: { vehiclePhotoUrls: currentPhotos },
          responseText: `✅ ${currentPhotos.length} photo(s) received.\n\n` + buildConfirmText({ ...data, vehiclePhotoUrls: currentPhotos }),
          responseButtons: [
            { id: "submit", title: "Submit my claim" },
            { id: "change", title: "Change something" },
          ],
        };
      }

      return {
        nextState: "CLAIM_PHOTOS",
        responseText: currentPhotos.length === 0
          ? "Please send the vehicle photos (Front, Rear, Left, Right, Damage 1, Damage 2)."
          : `${currentPhotos.length} photo(s) received so far. Keep sending, or reply *done* when finished.`,
      };
    }

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    case "CLAIM_CONFIRM": {
      const lower = input.toLowerCase();
      if (lower.includes("submit") || lower.includes("yes") || input === "1") {
        // Signal to engine to write to DB
        return {
          nextState: "CLAIM_SUBMITTED",
          responseText: "__SUBMIT__", // engine will intercept this and write to DB
        };
      }
      if (lower.includes("change") || input === "2") {
        return {
          nextState: "CLAIM_DESCRIPTION",
          responseText: "No problem. Let's go back to the description. What would you like to change?\n\n" +
            "Describe what happened again:",
        };
      }
      return {
        nextState: "CLAIM_CONFIRM",
        responseText: buildConfirmText(data),
        responseButtons: [
          { id: "submit", title: "Submit my claim" },
          { id: "change", title: "Change something" },
        ],
      };
    }

    default:
      return {
        nextState: "GREETING",
        responseText: "Something went wrong. Let me start over — how can I help you?",
        responseButtons: [
          { id: "claim", title: "Report an accident or loss" },
          { id: "status", title: "Follow up on a claim" },
          { id: "quote", title: "Get an insurance quote" },
          { id: "valuation", title: "Get a vehicle valuation" },
        ],
      };
  }
}
