import { describe, expect, it, vi } from "vitest";
import { applyWhatsAppSubmissionSideEffects } from "./submissionSideEffects";

describe("P0 Package 2 WhatsApp submission side effects", () => {
  it("sends one confirmation and schedules one document request across sequential duplicate delivery", async () => {
    const provider = { sendText: vi.fn().mockResolvedValue(undefined) };
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const followUps: Array<() => Promise<void>> = [];
    const session = { status: "collecting", state: "REVIEW" };
    const dependencies = { saveSession, scheduleFollowUp: (work: () => Promise<void>) => followUps.push(work) };

    await expect(applyWhatsAppSubmissionSideEffects(session, "+263771000001", provider, { claimNumber: "CLM-901", idempotent: false }, dependencies)).resolves.toMatchObject({ delivered: true });
    await expect(applyWhatsAppSubmissionSideEffects(session, "+263771000001", provider, { claimNumber: "CLM-901", idempotent: true }, dependencies)).resolves.toMatchObject({ delivered: false, reason: "already_submitted" });

    expect(saveSession).toHaveBeenCalledTimes(1);
    expect(provider.sendText).toHaveBeenCalledTimes(1);
    expect(followUps).toHaveLength(1);
    await followUps[0]!();
    expect(provider.sendText).toHaveBeenCalledTimes(2);
  });
});
