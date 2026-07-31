/**
 * shared/roles.ts
 *
 * Single source of truth for all platform role constants.
 *
 * Both server (server/routers/platform-user-roles.ts) and client
 * (client/src/pages/PlatformUserRoleManager.tsx) import from here.
 * The domain-middleware access-guard arrays remain local to that file
 * because they represent route-level subsets, not the full role registry.
 *
 * Import on server:  import { PLATFORM_ROLES } from "../../shared/roles";
 * Import on client:  import { PLATFORM_ROLES } from "@shared/roles";
 */

export const PLATFORM_ROLES = [
  "claimant",
  "panel_beater",
  "assessor",
  "insurer",
  "broker",
  "platform_super_admin",
  "admin",
  "user",
  "fleet_admin",
  "fleet_manager",
  "fleet_driver",
  "agency",
  "engineer",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const INSURER_ROLES = [
  "claims_processor",
  "assessor_internal",
  "risk_manager",
  "claims_manager",
  "executive",
] as const;

export type InsurerRole = (typeof INSURER_ROLES)[number];
