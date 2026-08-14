import { describe, expect, it, vi } from "vitest";
import { submitAgencyAssistedCanonicalClaim } from "../agency/agencyAssistedClaimSubmission";
import type { CanonicalClaimInput, CanonicalIntakeActor } from "./canonicalClaimIntake";
import {
  submitPortalCanonicalIntake,
  submitWhatsAppCanonicalIntake,
  type CanonicalIntakeAdapterDependencies,
} from "./canonicalIntakeAdapters";

type IsolatedRecord = {
  claimId: number;
  claimNumber: string;
  input: CanonicalClaimInput;
  assessmentState?: "started" | "recoverable_failure";
};

type IsolatedReplayHarness = {
  dependencies: CanonicalIntakeAdapterDependencies;
  records: Map<string, IsolatedRecord>;
  persistCalls: ReturnType<typeof vi.fn>;
  assessmentCalls: ReturnType<typeof vi.fn>;
  externalAssessmentAttempts: number;
  recoveryNotifications: number;
};

function makeIsolatedReplayHarness(options: { interruptFirstPersistence?: boolean; recoverableAssessmentFailure?: boolean } = {}): IsolatedReplayHarness {
  const records = new Map<string, IsolatedRecord>();
  let externalAssessmentAttempts = 0;
  let recoveryNotifications = 0;
  let interrupted = false;
  let nextClaimId = 900;
  const persistCalls = vi.fn(async (_actor: CanonicalIntakeActor, input: CanonicalClaimInput) => {
    if (options.interruptFirstPersistence && !interrupted) {
      interrupted = true;
      throw new Error("simulated pre-commit interruption");
    }
    const existing = records.get(input.idempotencyKey);
    if (existing) return { claimId: existing.claimId, claimNumber: existing.claimNumber, idempotent: true, repairerWarnings: [] };
    const record: IsolatedRecord = { claimId: nextClaimId++, claimNumber: `KNG-REPLAY-${nextClaimId}`, input };
    records.set(input.idempotencyKey, record);
    return { claimId: record.claimId, claimNumber: record.claimNumber, idempotent: false, repairerWarnings: [] };
  });
  const assessmentCalls = vi.fn(async (_actor: CanonicalIntakeActor, claimId: number, idempotencyKey: string) => {
    const record = records.get(idempotencyKey);
    if (!record || record.claimId !== claimId) throw new Error("isolated request state not found");
    if (record.assessmentState === "started") return { status: "already_recorded" as const };
    if (record.assessmentState === "recoverable_failure") return { status: "recoverable_failure" as const };
    externalAssessmentAttempts += 1;
    if (options.recoverableAssessmentFailure) {
      record.assessmentState = "recoverable_failure";
      recoveryNotifications += 1;
      return { status: "recoverable_failure" as const };
    }
    record.assessmentState = "started";
    return { status: "started" as const };
  });
  return {
    dependencies: { persist: persistCalls, startAssessment: assessmentCalls },
    records,
    persistCalls,
    assessmentCalls,
    get externalAssessmentAttempts() { return externalAssessmentAttempts; },
    get recoveryNotifications() { return recoveryNotifications; },
  };
}

const portalActor: CanonicalIntakeActor = { id: 21, tenantId: "tenant-replay", role: "claimant" };
const whatsappActor: CanonicalIntakeActor = { id: 22, tenantId: "tenant-replay", role: "claimant" };

function inputFor(channel: "web" | "whatsapp" | "agency_assisted", key: string): CanonicalClaimInput {
  const actorId = channel === "web" ? 21 : channel === "whatsapp" ? 22 : 55;
  const prefix = channel === "agency_assisted" ? "agency-claims/55" : `claims/${actorId}`;
  return {
    idempotencyKey: key,
    channel,
    vehicleMake: "Toyota",
    vehicleModel: "Corolla",
    vehicleRegistration: "REPLAY-001",
    incidentDate: "2026-08-14",
    incidentLocation: "Harare",
    incidentDescription: "Isolated adapter replay acceptance fixture.",
    claimantPhone: "+263771000001",
    attachments: [{ key: `${prefix}/damage.jpg`, url: "https://files.example.test/damage.jpg", fileName: "damage.jpg", fileSize: 128, mimeType: "image/jpeg", category: "damage_photo" }],
    repairerPreferences: [],
  };
}

async function runAdapter(
  adapter: "web_my_portal" | "whatsapp_local" | "agency_assisted",
  harness: IsolatedReplayHarness,
  key: string,
) {
  if (adapter === "web_my_portal") return submitPortalCanonicalIntake(harness.dependencies, portalActor, inputFor("web", key));
  if (adapter === "whatsapp_local") return submitWhatsAppCanonicalIntake(harness.dependencies, whatsappActor, inputFor("whatsapp", key));
  const input = inputFor("agency_assisted", key);
  return submitAgencyAssistedCanonicalClaim({
    agencyTenantId: "agency-replay",
    agencyUserId: 55,
    loadScopedClient: vi.fn().mockResolvedValue({ id: 7, fullName: "Agency Client", phone: "+263771000001" }),
    insurerExists: vi.fn().mockResolvedValue(true),
    resolveActor: vi.fn().mockResolvedValue({ id: 55, tenantId: "tenant-replay", role: "claimant", identityId: 81, trustLevel: "restricted_agency_assisted", uploadKeyPrefixes: ["agency-claims/55/"] }),
    ...harness.dependencies,
  }, {
    ...input,
    agencyClientId: 7,
    insurerTenantId: "tenant-replay",
    attachments: input.attachments,
  });
}

describe("Approved P0 Package 2 isolated adapter interruption and replay matrix", () => {
  it.each(["web_my_portal", "whatsapp_local", "agency_assisted"] as const)("keeps one canonical claim and evidence set for %s after a pre-commit interruption and replay", async (adapter) => {
    const harness = makeIsolatedReplayHarness({ interruptFirstPersistence: true });
    const key = `${adapter}-interrupted-001`;

    await expect(runAdapter(adapter, harness, key)).rejects.toThrow("simulated pre-commit interruption");
    expect(harness.records).toHaveLength(0);
    expect(harness.externalAssessmentAttempts).toBe(0);
    expect(harness.recoveryNotifications).toBe(0);

    const recovered = await runAdapter(adapter, harness, key);
    const replayed = await runAdapter(adapter, harness, key);
    const record = harness.records.get(key)!;

    expect(recovered).toMatchObject({ idempotent: false, assessmentStartStatus: "started" });
    expect(replayed).toMatchObject({ idempotent: true, assessmentStartStatus: "already_recorded" });
    expect(harness.records).toHaveLength(1);
    expect(record.input.attachments).toEqual(inputFor(adapter === "web_my_portal" ? "web" : adapter === "whatsapp_local" ? "whatsapp" : "agency_assisted", key).attachments);
    expect(harness.externalAssessmentAttempts).toBe(1);
    expect(harness.recoveryNotifications).toBe(0);
  });

  it.each(["web_my_portal", "whatsapp_local", "agency_assisted"] as const)("records one recoverable assessment notification and no duplicate external start for %s replay", async (adapter) => {
    const harness = makeIsolatedReplayHarness({ recoverableAssessmentFailure: true });
    const key = `${adapter}-recoverable-001`;

    const first = await runAdapter(adapter, harness, key);
    const replayed = await runAdapter(adapter, harness, key);

    expect(first).toMatchObject({ idempotent: false, assessmentStartStatus: "recoverable_failure" });
    expect(replayed).toMatchObject({ idempotent: true, assessmentStartStatus: "recoverable_failure" });
    expect(harness.records).toHaveLength(1);
    expect(harness.externalAssessmentAttempts).toBe(1);
    expect(harness.recoveryNotifications).toBe(1);
  });
});
