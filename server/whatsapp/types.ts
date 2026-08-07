/**
 * WhatsApp Engine — Shared Types
 */

export const INSURERS = [
  { id: "old_mutual",      label: "Old Mutual" },
  { id: "cell_insurance",  label: "Cell Insurance" },
  { id: "zimnat",          label: "Zimnat" },
  { id: "nicoz_diamond",   label: "NICOZ Diamond" },
  { id: "allied",          label: "Allied Insurance" },
  { id: "alliance",        label: "Alliance Insurance" },
  { id: "other",           label: "Other insurer" },
] as const;

export const ROAD_SURFACES = [
  { id: "dry_tarmac",      label: "Dry tarmac / asphalt", mu: 0.75 },
  { id: "wet_tarmac",      label: "Wet tarmac (rain)",    mu: 0.45 },
  { id: "gravel",          label: "Gravel / dirt road",   mu: 0.50 },
  { id: "mud",             label: "Mud / flooded road",   mu: 0.25 },
  { id: "construction",    label: "Construction / uneven surface", mu: 0.40 },
  { id: "not_sure",        label: "Not sure",             mu: 0.75 },
] as const;

export const WEATHER_CONDITIONS = [
  { id: "clear",           label: "Clear / sunny" },
  { id: "overcast",        label: "Overcast / cloudy" },
  { id: "light_rain",      label: "Rain (light)" },
  { id: "heavy_rain",      label: "Heavy rain / storm" },
  { id: "fog",             label: "Fog or mist" },
  { id: "night",           label: "Night / dark conditions" },
  { id: "not_sure",        label: "Not sure" },
] as const;

export const INCIDENT_TYPES = [
  { id: "collision",       label: "Collision / Accident",
    prompt: "Tell me what happened — describe the collision in as much detail as you can.\n\n(Include: what you were doing, what the other vehicle did, road conditions, impact point, whether anyone else was involved.)" },
  { id: "theft",           label: "Theft or Hijacking",
    prompt: "Tell me what happened — when did you notice the vehicle was taken, and what were the circumstances?" },
  { id: "hail",            label: "Hail or Flood Damage",
    prompt: "Tell me what happened — where was the vehicle when the damage occurred, and how severe was the weather event?" },
  { id: "fire",            label: "Fire Damage",
    prompt: "Tell me what happened — where did the fire start and how did it spread?" },
  { id: "animal",          label: "Animal Collision",
    prompt: "Tell me what happened — what animal was involved and where did the collision occur?" },
  { id: "other",           label: "Other — describe it",
    prompt: "Tell me what happened — describe the incident in your own words.\n\n(For example: pothole damage, self-rollover, vandalism, mechanical failure — include as much detail as you can.)" },
] as const;

export const LICENCE_AGE_RANGES = [
  { id: "under_1",   label: "Under 1 year" },
  { id: "1_to_3",    label: "1–3 years" },
  { id: "3_to_5",    label: "3–5 years" },
  { id: "5_to_10",   label: "5–10 years" },
  { id: "over_10",   label: "Over 10 years" },
] as const;

// ─── Session Data ─────────────────────────────────────────────────────────────
export interface ClaimSessionData {
  // Insurer
  insurerName?: string;
  // Safety
  injuryFlag?: boolean;
  vehicleBlocking?: boolean;
  // Police
  policeAttended?: boolean | null;
  policeOfficerDetails?: string;
  // Vehicle
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleKnown?: boolean; // found in KINGA DB
  // Driver
  driverIsSelf?: boolean;
  driverName?: string;
  driverLicenceNumber?: string;
  licenceAgeRange?: string;
  licencePhotoUrl?: string;
  // Incident
  incidentDate?: string;
  incidentType?: string;
  incidentDescription?: string;
  roadSurface?: string;
  weatherConditions?: string;
  incidentLocation?: string;
  gpsLat?: number;
  gpsLng?: number;
  // Photos (vehicle)
  vehiclePhotoUrls?: string[];
  // Submission
  claimId?: number;
  claimNumber?: string;
}

export interface QuoteSessionData {
  productCategory?: string;
  insuranceType?: string;
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
}

export interface ValuationSessionData {
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  mileage?: string;
  photoUrls?: string[];
}

export type SessionData = ClaimSessionData | QuoteSessionData | ValuationSessionData | Record<string, unknown>;

// ─── Conversation States ──────────────────────────────────────────────────────
export type ConversationState =
  | "IDLE"
  | "GREETING"
  // Claim journey
  | "CLAIM_INSURER"
  | "CLAIM_SAFETY_INJURIES"
  | "CLAIM_INJURY_PATH"
  | "CLAIM_SAFETY_VEHICLE"
  | "CLAIM_POLICE"
  | "CLAIM_POLICE_OFFICER"
  | "CLAIM_REGISTRATION"
  | "CLAIM_VEHICLE_CONFIRM"
  | "CLAIM_VEHICLE_MAKE"
  | "CLAIM_VEHICLE_YEAR"
  | "CLAIM_DRIVER_SELF"
  | "CLAIM_DRIVER_NAME"
  | "CLAIM_LICENCE_NUMBER"
  | "CLAIM_LICENCE_AGE"
  | "CLAIM_LICENCE_PHOTO"
  | "CLAIM_DATE"
  | "CLAIM_INCIDENT_TYPE"
  | "CLAIM_DESCRIPTION"
  | "CLAIM_ROAD_SURFACE"
  | "CLAIM_WEATHER"
  | "CLAIM_LOCATION"
  | "CLAIM_PHOTOS"
  | "CLAIM_CONFIRM"
  | "CLAIM_SUBMITTED"
  | "AWAITING_DOCS"
  // Status journey
  | "STATUS_LOOKUP"
  // Quote journey
  | "QUOTE_PRODUCT"
  | "QUOTE_COVER_TYPE"
  | "QUOTE_REGISTRATION"
  | "QUOTE_VEHICLE_MAKE"
  | "QUOTE_VEHICLE_YEAR"
  | "QUOTE_SUBMITTED"
  // Valuation journey
  | "VALUATION_REG"
  | "VALUATION_VEHICLE_MAKE"
  | "VALUATION_VEHICLE_YEAR"
  | "VALUATION_MILEAGE"
  | "VALUATION_PHOTOS"
  | "VALUATION_SUBMITTED"
  | "TIMED_OUT";

// ─── Incoming Message ─────────────────────────────────────────────────────────
export interface IncomingMessage {
  from: string;        // E.164 phone number
  body: string;        // text content
  mediaUrl?: string;   // URL of attached image/document
  mediaType?: string;  // MIME type
  latitude?: number;   // from location message
  longitude?: number;
  locationAddress?: string;
  numMedia?: number;
}
