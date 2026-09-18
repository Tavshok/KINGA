import { notifyOwner, type NotificationPayload } from "./_core/notification";
import { RequiredClaimEventPersistenceError } from "./db/intelligence-db";

type OwnerNotifier = (payload: NotificationPayload) => Promise<boolean>;

/**
 * Makes a required vehicle-containment audit persistence failure operationally
 * visible without changing the underlying containment decision.
 */
export async function handleVehicleRegistryRequiredAuditFailure(
  error: unknown,
  notify: OwnerNotifier = notifyOwner
): Promise<void> {
  if (!(error instanceof RequiredClaimEventPersistenceError)) {
    console.warn("[VehicleRegistry] Post-pipeline upsert failed:", error);
    return;
  }

  const payload: NotificationPayload = {
    title: "Required vehicle containment audit was not persisted",
    content:
      "A claim was contained from a cross-tenant vehicle-registry match, but the required audit " +
      "event could not be saved. The containment decision remains in effect; review the service logs.",
  };

  try {
    const delivered = await notify(payload);
    if (!delivered) {
      console.error(
        `[VehicleRegistry] Required containment audit alert was not accepted for claim ${error.claimId}`
      );
    }
  } catch (notificationError) {
    console.error(
      `[VehicleRegistry] Required containment audit alert failed for claim ${error.claimId}:`,
      notificationError
    );
  }
}
