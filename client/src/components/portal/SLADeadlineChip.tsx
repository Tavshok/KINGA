/**
 * SLADeadlineChip — Shared SLA Deadline Visibility Component
 *
 * KINGA Design Standard v1.0 — Standard 6: Queue Intelligence
 * Every claim/job row must display SLA status so users can prioritise at a glance.
 *
 * Usage:
 *   // From a createdAt timestamp (72h SLA default):
 *   <SLADeadlineChip createdAt={claim.createdAt} />
 *
 *   // From a specific deadline date:
 *   <SLADeadlineChip deadline={claim.recoveryDeadline} />
 *
 *   // From pre-computed slaHoursRemaining (e.g. from getProcessorQueue):
 *   <SLADeadlineChip hoursRemaining={claim.slaHoursRemaining} />
 *
 *   // Custom SLA window (e.g. 48h for assessors):
 *   <SLADeadlineChip createdAt={claim.createdAt} slaHours={48} />
 */

import React from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  KINGA_RED,
  KINGA_RED_BG,
  KINGA_AMBER,
  KINGA_AMBER_BG,
  KINGA_GREEN,
  KINGA_GREEN_BG,
} from "@/components/KingaPortalShell";

// ── SLA status type ───────────────────────────────────────────────────────────
export type SLAStatus = "breached" | "critical" | "warning" | "ok";

export interface SLAChipData {
  status: SLAStatus;
  label: string;
  hoursRemaining: number;
  color: string;
  bg: string;
}

// ── Core SLA calculation ──────────────────────────────────────────────────────
/**
 * Compute SLA chip data from hours remaining.
 * Thresholds:
 *   breached  : hoursRemaining < 0
 *   critical  : 0 ≤ hoursRemaining < 12
 *   warning   : 12 ≤ hoursRemaining < 24
 *   ok        : hoursRemaining ≥ 24
 */
export function computeSLAFromHours(hoursRemaining: number): SLAChipData {
  if (hoursRemaining < 0) {
    const overdue = Math.abs(Math.round(hoursRemaining));
    return {
      status: "breached",
      label: `SLA Breached ${overdue}h ago`,
      hoursRemaining,
      color: KINGA_RED,
      bg: KINGA_RED_BG,
    };
  }
  if (hoursRemaining < 12) {
    return {
      status: "critical",
      label: `${Math.round(hoursRemaining)}h left`,
      hoursRemaining,
      color: KINGA_RED,
      bg: KINGA_RED_BG,
    };
  }
  if (hoursRemaining < 24) {
    return {
      status: "warning",
      label: `${Math.round(hoursRemaining)}h left`,
      hoursRemaining,
      color: KINGA_AMBER,
      bg: KINGA_AMBER_BG,
    };
  }
  return {
    status: "ok",
    label: `${Math.round(hoursRemaining)}h left`,
    hoursRemaining,
    color: KINGA_GREEN,
    bg: KINGA_GREEN_BG,
  };
}

/**
 * Compute SLA chip data from a createdAt timestamp and an SLA window in hours.
 */
export function computeSLAFromCreatedAt(
  createdAt: string | Date | null | undefined,
  slaHours = 72
): SLAChipData | null {
  if (!createdAt) return null;
  const ageHours = (Date.now() - new Date(createdAt as string).getTime()) / 3_600_000;
  return computeSLAFromHours(slaHours - ageHours);
}

/**
 * Compute SLA chip data from a specific deadline date string (e.g. "2025-12-31").
 */
export function computeSLAFromDeadline(
  deadline: string | Date | null | undefined
): SLAChipData | null {
  if (!deadline) return null;
  const hoursRemaining =
    (new Date(deadline as string).getTime() - Date.now()) / 3_600_000;
  return computeSLAFromHours(hoursRemaining);
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface SLADeadlineChipProps {
  /** createdAt timestamp — chip computed from age vs slaHours window */
  createdAt?: string | Date | null;
  /** SLA window in hours when using createdAt (default: 72h) */
  slaHours?: number;
  /** Specific deadline date — chip computed from time remaining */
  deadline?: string | Date | null;
  /** Pre-computed hours remaining — takes priority over createdAt/deadline */
  hoursRemaining?: number;
  /** Only show chip when SLA is warning or worse (hides "ok" chips) */
  warnOnly?: boolean;
  /** Show a checkmark when status is "ok" (default: false — shows nothing) */
  showOk?: boolean;
  /** Extra className */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SLADeadlineChip({
  createdAt,
  slaHours = 72,
  deadline,
  hoursRemaining: hoursRemainingProp,
  warnOnly = true,
  showOk = false,
  className = "",
}: SLADeadlineChipProps) {
  // Compute chip data from whichever source is provided
  let chip: SLAChipData | null = null;

  if (hoursRemainingProp !== undefined) {
    chip = computeSLAFromHours(hoursRemainingProp);
  } else if (deadline) {
    chip = computeSLAFromDeadline(deadline);
  } else if (createdAt) {
    chip = computeSLAFromCreatedAt(createdAt, slaHours);
  }

  if (!chip) return null;

  // Suppress "ok" chips unless showOk is true
  if (chip.status === "ok" && warnOnly && !showOk) return null;

  // Icon selection
  const Icon =
    chip.status === "ok"
      ? CheckCircle2
      : chip.status === "warning"
      ? Clock
      : AlertTriangle;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${className}`}
      style={{
        background: chip.bg,
        color: chip.color,
        border: `1px solid ${chip.color}30`,
      }}
      title={`SLA: ${chip.label}`}
    >
      <Icon size={10} />
      {chip.label}
    </span>
  );
}

// ── Convenience hook for list-level SLA summary ───────────────────────────────
/**
 * Returns counts of breached, critical, and warning items from a list.
 * Useful for the Critical Attention Zone and KPI strips.
 */
export function useSLASummary(
  items: Array<{ createdAt?: string | Date | null; slaHoursRemaining?: number }>,
  slaHours = 72
) {
  let breached = 0;
  let critical = 0;
  let warning = 0;

  for (const item of items) {
    const chip =
      item.slaHoursRemaining !== undefined
        ? computeSLAFromHours(item.slaHoursRemaining)
        : computeSLAFromCreatedAt(item.createdAt, slaHours);
    if (!chip) continue;
    if (chip.status === "breached") breached++;
    else if (chip.status === "critical") critical++;
    else if (chip.status === "warning") warning++;
  }

  return { breached, critical, warning, total: breached + critical + warning };
}
