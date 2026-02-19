// @ts-nocheck
/**
 * Notification Deduplication Tracker
 * 
 * Prevents duplicate email notifications for the same claim events.
 * Tracks sent notifications with cooldown periods.
 */

interface NotificationRecord {
  claimId: number;
  notificationType: string;
  lastSentAt: Date;
}

// In-memory tracker (in production, use Redis or database table)
const notificationHistory: Map<string, NotificationRecord> = new Map();

// Cooldown periods (in milliseconds)
const COOLDOWN_PERIODS = {
  assessor_assignment: 24 * 60 * 60 * 1000, // 24 hours
  ai_assessment_complete: 6 * 60 * 60 * 1000, // 6 hours
  quote_submitted: 12 * 60 * 60 * 1000, // 12 hours
  fraud_detected: 24 * 60 * 60 * 1000, // 24 hours
  status_change: 1 * 60 * 60 * 1000, // 1 hour
};

/**
 * Check if notification should be sent (not in cooldown period)
 */
export function shouldSendNotification(
  claimId: number,
  notificationType: keyof typeof COOLDOWN_PERIODS
): boolean {
  const key = `${claimId}-${notificationType}`;
  const record = notificationHistory.get(key);
  
  if (!record) {
    return true; // Never sent before
  }
  
  const cooldownPeriod = COOLDOWN_PERIODS[notificationType];
  const timeSinceLastSent = Date.now() - record.lastSentAt.getTime();
  
  return timeSinceLastSent > cooldownPeriod;
}

/**
 * Record that a notification was sent
 */
export function recordNotificationSent(
  claimId: number,
  notificationType: keyof typeof COOLDOWN_PERIODS
): void {
  const key = `${claimId}-${notificationType}`;
  notificationHistory.set(key, {
    claimId,
    notificationType,
    lastSentAt: new Date(),
  });
  
  console.log(`[Notification Tracker] Recorded ${notificationType} for claim ${claimId}`);
}

/**
 * Clear notification history for a claim (useful for testing)
 */
export function clearNotificationHistory(claimId: number): void {
  const keysToDelete: string[] = [];
  
  for (const [key, record] of Array.from(notificationHistory.entries())) {
    if (record.claimId === claimId) {
      keysToDelete.push(key);
    }
  }
  
  for (const key of keysToDelete) {
    notificationHistory.delete(key);
  }
  
  console.log(`[Notification Tracker] Cleared history for claim ${claimId}`);
}

/**
 * Get notification history for a claim (for debugging)
 */
export function getNotificationHistory(claimId: number): NotificationRecord[] {
  const history: NotificationRecord[] = [];
  
  for (const record of Array.from(notificationHistory.values())) {
    if (record.claimId === claimId) {
      history.push(record);
    }
  }
  
  return history;
}
