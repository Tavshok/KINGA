import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDb } from "../db";
import { notifyOwner, type NotificationPayload } from "../_core/notification";

const LEASE_NAME = "recovery-deadline-sweep";
const LEASE_DURATION_MS = 60_000;
const DISPATCH_STALE_AFTER_MS = 5 * 60_000;
const RETRY_DELAY_MS = 60_000;
const MAX_CASES_PER_SWEEP = 100;
const MAX_EFFECTS_PER_SWEEP = 100;
const TERMINAL_STATUSES = [
  "settled_full",
  "settled_partial",
  "closed_no_recovery",
  "archived",
] as const;
const ALERT_THRESHOLDS = [7, 14, 30, 60, 90] as const;
const MIN_DAYS_BETWEEN_ALERTS = 6;

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type RecoveryCase = {
  id: number;
  claimNumber: string | null;
  recoveryDeadline: string | null;
  recoveryDeadlineAlertSentAt: string | null;
  thirdPartyName: string | null;
  thirdPartyInsurer: string | null;
  currencyCode: string | null;
  approvedSettlementAmount: number | null;
  recoveryPotentialScore: number | null;
  status: string;
};

type AlertEffect = {
  recoveryCase: RecoveryCase;
  effectKey: string;
  payload: NotificationPayload;
};

type HeldLease = {
  holderId: string;
  fence: number;
};

type ClaimedEffect = AlertEffect & {
  outboxId: string;
};

type ExecutionResult = {
  acquired: boolean;
  staged: number;
  delivered: number;
  retryable: number;
  discarded: number;
  lostLease: boolean;
};

export type RecoveryDeadlineSweepExecutorDependencies = {
  database?: Database | null;
  notify?: (payload: NotificationPayload) => Promise<boolean>;
  now?: () => Date;
  holderId?: string;
  maxCases?: number;
  maxEffects?: number;
  recoveryCaseId?: number;
};

function toSqlTimestamp(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds);
}

function toRows<T>(result: unknown): T[] {
  return Array.isArray(result) && Array.isArray(result[0])
    ? (result[0] as T[])
    : [];
}

function affectedRows(result: unknown): number {
  if (!Array.isArray(result)) return 0;
  const first = result[0] as { affectedRows?: number } | undefined;
  return Number(first?.affectedRows ?? 0);
}

function daysUntil(dateValue: string, now: Date): number | null {
  const target = new Date(dateValue);
  if (!Number.isFinite(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function thresholdFor(daysLeft: number): number | null {
  return ALERT_THRESHOLDS.find(threshold => daysLeft <= threshold) ?? null;
}

function urgencyLabel(daysLeft: number): string {
  if (daysLeft <= 7) return "CRITICAL";
  if (daysLeft <= 14) return "URGENT";
  if (daysLeft <= 30) return "HIGH PRIORITY";
  return "REMINDER";
}

function urgencyEmoji(daysLeft: number): string {
  if (daysLeft <= 7) return "🚨";
  if (daysLeft <= 14) return "⚠️";
  if (daysLeft <= 30) return "📋";
  return "📅";
}

function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}

function effectForRecoveryCase(
  recoveryCase: RecoveryCase,
  now: Date
): AlertEffect | null {
  if (isTerminal(recoveryCase.status) || !recoveryCase.recoveryDeadline)
    return null;
  const daysLeft = daysUntil(recoveryCase.recoveryDeadline, now);
  if (daysLeft === null) return null;

  let effectKey: string;
  let urgency: string;
  if (daysLeft < 0) {
    if (recoveryCase.recoveryDeadlineAlertSentAt) return null;
    effectKey = "lapsed";
    urgency = "LAPSED";
  } else {
    const threshold = thresholdFor(daysLeft);
    if (threshold === null) return null;

    if (recoveryCase.recoveryDeadlineAlertSentAt) {
      const previous = new Date(recoveryCase.recoveryDeadlineAlertSentAt);
      if (!Number.isFinite(previous.getTime())) return null;
      const daysSinceLastAlert = Math.floor(
        (now.getTime() - previous.getTime()) / 86_400_000
      );
      if (daysSinceLastAlert < MIN_DAYS_BETWEEN_ALERTS) return null;
      const previousThreshold = thresholdFor(daysLeft + daysSinceLastAlert);
      if (previousThreshold === threshold) return null;
    }

    effectKey = `threshold-${threshold}`;
    urgency = urgencyLabel(daysLeft);
  }

  const emoji = daysLeft < 0 ? "🔴" : urgencyEmoji(daysLeft);
  const deadline = new Date(recoveryCase.recoveryDeadline);
  const deadlineLabel = deadline.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const title = `${emoji} [${urgency}] Recovery Deadline — Recovery Case RC-${recoveryCase.id}`;
  const content = [
    `Recovery Case RC-${recoveryCase.id} (Claim: ${recoveryCase.claimNumber ?? "N/A"}) requires immediate attention.`,
    "",
    daysLeft < 0
      ? `⚠️ The recovery deadline of ${deadlineLabel} has PASSED. Legal action may no longer be possible. Please consult your legal team immediately.`
      : `The recovery deadline is ${deadlineLabel} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining.`,
    "",
    `Third Party: ${recoveryCase.thirdPartyName ?? "Unknown"}`,
    `Third-Party Insurer: ${recoveryCase.thirdPartyInsurer ?? "Unknown"}`,
    `Approved Settlement Amount: ${recoveryCase.currencyCode ?? "USD"} ${
      recoveryCase.approvedSettlementAmount === null
        ? "N/A"
        : (recoveryCase.approvedSettlementAmount / 100).toLocaleString(
            "en-US",
            {
              minimumFractionDigits: 2,
            }
          )
    }`,
    `Recovery Potential Score: ${recoveryCase.recoveryPotentialScore ?? "N/A"}/100`,
    `Current Status: ${recoveryCase.status.replace(/_/g, " ")}`,
    "",
    "Action required: Log in to the KINGA Recovery Portal and update this case immediately.",
    `Case URL: /insurer-portal/recovery/${recoveryCase.id}`,
  ].join("\n");

  return { recoveryCase, effectKey, payload: { title, content } };
}

function outboxId(recoveryCaseId: number, effectKey: string): string {
  return createHash("sha256")
    .update(`recovery-deadline-alert:${recoveryCaseId}:${effectKey}`)
    .digest("hex");
}

async function currentLease(
  tx: Transaction,
  heldLease: HeldLease,
  now: Date
): Promise<boolean> {
  const rows = toRows<{
    holder_id: string | null;
    fence: number;
    lease_expires_at: string | null;
  }>(
    await tx.execute(sql`
      SELECT holder_id, fence, lease_expires_at
      FROM recovery_sweep_leases
      WHERE lease_name = ${LEASE_NAME}
      FOR UPDATE
    `)
  );
  const lease = rows[0];
  return (
    lease?.holder_id === heldLease.holderId &&
    Number(lease.fence) === heldLease.fence &&
    lease.lease_expires_at !== null &&
    new Date(lease.lease_expires_at).getTime() > now.getTime()
  );
}

async function acquireLease(
  database: Database,
  holderId: string,
  now: Date
): Promise<HeldLease | null> {
  const nowSql = toSqlTimestamp(now);
  const expirySql = toSqlTimestamp(addMilliseconds(now, LEASE_DURATION_MS));

  return database.transaction(async tx => {
    await tx.execute(sql`
      INSERT INTO recovery_sweep_leases
        (lease_name, holder_id, fence, lease_expires_at)
      VALUES (${LEASE_NAME}, ${holderId}, 1, ${expirySql})
      ON DUPLICATE KEY UPDATE
        holder_id = IF(lease_expires_at IS NULL OR lease_expires_at <= ${nowSql}, VALUES(holder_id), holder_id),
        fence = IF(lease_expires_at IS NULL OR lease_expires_at <= ${nowSql}, fence + 1, fence),
        lease_expires_at = IF(lease_expires_at IS NULL OR lease_expires_at <= ${nowSql}, VALUES(lease_expires_at), lease_expires_at)
    `);

    const rows = toRows<{ holder_id: string | null; fence: number }>(
      await tx.execute(sql`
        SELECT holder_id, fence
        FROM recovery_sweep_leases
        WHERE lease_name = ${LEASE_NAME}
        FOR UPDATE
      `)
    );
    const lease = rows[0];
    if (!lease || lease.holder_id !== holderId) return null;
    return { holderId, fence: Number(lease.fence) };
  });
}

async function selectEligibleCases(
  database: Database,
  now: Date,
  limit: number,
  recoveryCaseId?: number
): Promise<RecoveryCase[]> {
  const inNinetyDays = addMilliseconds(now, 90 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = toRows<RecoveryCase>(
    await database.execute(sql`
      SELECT
        id,
        claim_id AS claimId,
        recovery_deadline AS recoveryDeadline,
        recovery_deadline_alert_sent_at AS recoveryDeadlineAlertSentAt,
        third_party_name AS thirdPartyName,
        third_party_insurer AS thirdPartyInsurer,
        currency_code AS currencyCode,
        approved_settlement_amount AS approvedSettlementAmount,
        recovery_potential_score AS recoveryPotentialScore,
        status,
        (SELECT claim_number FROM claims WHERE claims.id = recovery_cases.claim_id) AS claimNumber
      FROM recovery_cases
      WHERE recovery_deadline IS NOT NULL
        AND recovery_deadline <= ${inNinetyDays}
        AND status NOT IN ('settled_full', 'settled_partial', 'closed_no_recovery', 'archived')
        AND (${recoveryCaseId ?? null} IS NULL OR id = ${recoveryCaseId ?? null})
      ORDER BY id ASC
      LIMIT ${limit}
    `)
  );
  return rows;
}

async function stageEffect(
  database: Database,
  heldLease: HeldLease,
  effect: AlertEffect,
  now: Date
): Promise<boolean> {
  return database.transaction(async tx => {
    if (!(await currentLease(tx, heldLease, now))) return false;
    await tx.execute(sql`
      INSERT INTO recovery_deadline_alert_outbox
        (id, recovery_case_id, effect_key, state, attempt_count, next_attempt_at)
      VALUES (
        ${outboxId(effect.recoveryCase.id, effect.effectKey)},
        ${effect.recoveryCase.id},
        ${effect.effectKey},
        'pending',
        0,
        ${toSqlTimestamp(now)}
      )
      ON DUPLICATE KEY UPDATE id = id
    `);
    return true;
  });
}

async function claimNextEffect(
  database: Database,
  heldLease: HeldLease,
  now: Date
): Promise<ClaimedEffect | "lost-lease" | null> {
  const staleBefore = toSqlTimestamp(
    addMilliseconds(now, -DISPATCH_STALE_AFTER_MS)
  );
  const nowSql = toSqlTimestamp(now);

  return database.transaction(async tx => {
    if (!(await currentLease(tx, heldLease, now))) return "lost-lease";

    const candidates = toRows<{
      id: string;
      recovery_case_id: number;
      effect_key: string;
      recoveryDeadline: string | null;
      recoveryDeadlineAlertSentAt: string | null;
      claimNumber: string | null;
      thirdPartyName: string | null;
      thirdPartyInsurer: string | null;
      currencyCode: string | null;
      approvedSettlementAmount: number | null;
      recoveryPotentialScore: number | null;
      status: string;
    }>(
      await tx.execute(sql`
        SELECT
          o.id,
          o.recovery_case_id,
          o.effect_key,
          r.recovery_deadline AS recoveryDeadline,
          r.recovery_deadline_alert_sent_at AS recoveryDeadlineAlertSentAt,
          r.third_party_name AS thirdPartyName,
          r.third_party_insurer AS thirdPartyInsurer,
          r.currency_code AS currencyCode,
          r.approved_settlement_amount AS approvedSettlementAmount,
          r.recovery_potential_score AS recoveryPotentialScore,
          r.status,
          c.claim_number AS claimNumber
        FROM recovery_deadline_alert_outbox o
        JOIN recovery_cases r ON r.id = o.recovery_case_id
        LEFT JOIN claims c ON c.id = r.claim_id
        WHERE (
            (o.state = 'pending' AND o.next_attempt_at <= ${nowSql})
            OR (o.state = 'dispatching' AND o.claimed_at <= ${staleBefore})
          )
        ORDER BY o.created_at ASC
        LIMIT 1
        FOR UPDATE
      `)
    );
    const candidate = candidates[0];
    if (!candidate) return null;

    const recoveryCase: RecoveryCase = {
      id: Number(candidate.recovery_case_id),
      claimNumber: candidate.claimNumber,
      recoveryDeadline: candidate.recoveryDeadline,
      recoveryDeadlineAlertSentAt: candidate.recoveryDeadlineAlertSentAt,
      thirdPartyName: candidate.thirdPartyName,
      thirdPartyInsurer: candidate.thirdPartyInsurer,
      currencyCode: candidate.currencyCode,
      approvedSettlementAmount: candidate.approvedSettlementAmount,
      recoveryPotentialScore: candidate.recoveryPotentialScore,
      status: candidate.status,
    };
    const effect = effectForRecoveryCase(recoveryCase, now);
    if (!effect || effect.effectKey !== candidate.effect_key) {
      await tx.execute(sql`
        UPDATE recovery_deadline_alert_outbox
        SET state = 'discarded', claimed_by = NULL, claimed_fence = NULL,
            claimed_at = NULL, updated_at = ${nowSql}
        WHERE id = ${candidate.id}
      `);
      return null;
    }

    await tx.execute(sql`
      UPDATE recovery_deadline_alert_outbox
      SET state = 'dispatching',
          attempt_count = attempt_count + 1,
          claimed_by = ${heldLease.holderId},
          claimed_fence = ${heldLease.fence},
          claimed_at = ${nowSql},
          updated_at = ${nowSql}
      WHERE id = ${candidate.id}
    `);
    return { ...effect, outboxId: candidate.id };
  });
}

async function completeDelivery(
  database: Database,
  heldLease: HeldLease,
  claim: ClaimedEffect,
  now: Date
): Promise<boolean> {
  const nowSql = toSqlTimestamp(now);
  return database.transaction(async tx => {
    if (!(await currentLease(tx, heldLease, now))) return false;
    const delivered = await tx.execute(sql`
      UPDATE recovery_deadline_alert_outbox
      SET state = 'delivered', delivered_at = ${nowSql}, updated_at = ${nowSql}
      WHERE id = ${claim.outboxId}
        AND state = 'dispatching'
        AND claimed_by = ${heldLease.holderId}
        AND claimed_fence = ${heldLease.fence}
    `);
    if (affectedRows(delivered) !== 1) return false;

    const suppressed = await tx.execute(sql`
      UPDATE recovery_cases
      SET recovery_deadline_alert_sent_at = ${nowSql}
      WHERE id = ${claim.recoveryCase.id}
    `);
    return affectedRows(suppressed) === 1;
  });
}

async function releaseForRetry(
  database: Database,
  heldLease: HeldLease,
  claim: ClaimedEffect,
  now: Date
): Promise<void> {
  const nowSql = toSqlTimestamp(now);
  const retryAt = toSqlTimestamp(addMilliseconds(now, RETRY_DELAY_MS));
  await database.transaction(async tx => {
    await tx.execute(sql`
      UPDATE recovery_deadline_alert_outbox
      SET state = 'pending', next_attempt_at = ${retryAt},
          claimed_by = NULL, claimed_fence = NULL, claimed_at = NULL,
          updated_at = ${nowSql}
      WHERE id = ${claim.outboxId}
        AND state = 'dispatching'
        AND claimed_by = ${heldLease.holderId}
        AND claimed_fence = ${heldLease.fence}
    `);
  });
}

/**
 * Runs at most one fenced, bounded recovery-deadline sweep. A contender that
 * cannot acquire the lease performs no global scan, notification, or mutation.
 */
export async function runFencedRecoveryDeadlineSweep(
  dependencies: RecoveryDeadlineSweepExecutorDependencies = {}
): Promise<ExecutionResult> {
  const database = dependencies.database ?? (await getDb());
  if (!database)
    throw new Error("Recovery deadline sweep database is unavailable");

  const now = dependencies.now?.() ?? new Date();
  const heldLease = await acquireLease(
    database,
    dependencies.holderId ?? randomUUID(),
    now
  );
  if (!heldLease) {
    return {
      acquired: false,
      staged: 0,
      delivered: 0,
      retryable: 0,
      discarded: 0,
      lostLease: false,
    };
  }

  let staged = 0;
  let delivered = 0;
  let retryable = 0;
  let discarded = 0;
  const cases = await selectEligibleCases(
    database,
    now,
    Math.min(
      Math.max(dependencies.maxCases ?? MAX_CASES_PER_SWEEP, 1),
      MAX_CASES_PER_SWEEP
    ),
    dependencies.recoveryCaseId
  );

  for (const recoveryCase of cases) {
    const effect = effectForRecoveryCase(recoveryCase, now);
    if (!effect) continue;
    if (!(await stageEffect(database, heldLease, effect, now))) {
      return {
        acquired: true,
        staged,
        delivered,
        retryable,
        discarded,
        lostLease: true,
      };
    }
    staged += 1;
  }

  const notify = dependencies.notify ?? notifyOwner;
  const maxEffects = Math.min(
    Math.max(dependencies.maxEffects ?? MAX_EFFECTS_PER_SWEEP, 1),
    MAX_EFFECTS_PER_SWEEP
  );
  for (let attempt = 0; attempt < maxEffects; attempt += 1) {
    const claim = await claimNextEffect(
      database,
      heldLease,
      dependencies.now?.() ?? new Date()
    );
    if (claim === "lost-lease") {
      return {
        acquired: true,
        staged,
        delivered,
        retryable,
        discarded,
        lostLease: true,
      };
    }
    if (!claim) break;

    let accepted = false;
    try {
      accepted = (await notify(claim.payload)) === true;
    } catch {
      accepted = false;
    }

    const completionTime = dependencies.now?.() ?? new Date();
    if (accepted) {
      if (await completeDelivery(database, heldLease, claim, completionTime)) {
        delivered += 1;
      } else {
        return {
          acquired: true,
          staged,
          delivered,
          retryable,
          discarded,
          lostLease: true,
        };
      }
    } else {
      await releaseForRetry(database, heldLease, claim, completionTime);
      retryable += 1;
    }
  }

  return {
    acquired: true,
    staged,
    delivered,
    retryable,
    discarded,
    lostLease: false,
  };
}

export async function runFencedRecoveryDeadlineCheckForCase(
  caseId: number
): Promise<ExecutionResult> {
  return runFencedRecoveryDeadlineSweep({
    recoveryCaseId: caseId,
    maxCases: 1,
    maxEffects: 1,
  });
}

export const RECOVERY_DEADLINE_SWEEP_LIMITS = {
  leaseName: LEASE_NAME,
  leaseDurationMs: LEASE_DURATION_MS,
  maxCases: MAX_CASES_PER_SWEEP,
  maxEffects: MAX_EFFECTS_PER_SWEEP,
} as const;
