/**
 * Identity & Access Management Database Schema (PostgreSQL)
 * 
 * Owned by: identity-access-service
 * Database: identity_db
 * 
 * @author Tavonga Shoko
 */

import { pgTable, serial, varchar, text, timestamp, boolean, integer, decimal, pgEnum, jsonb } from "drizzle-orm/pg-core";

// Enums
export const roleEnum = pgEnum("role", ["user", "admin", "insurer", "assessor", "panel_beater", "claimant"]);
export const insurerRoleEnum = pgEnum("insurer_role", ["claims_processor", "internal_assessor", "risk_manager", "claims_manager", "executive"]);
export const assessorTierEnum = pgEnum("assessor_tier", ["free", "premium", "enterprise"]);
export const permissionScopeEnum = pgEnum("permission_scope", ["global", "organization", "team", "self"]);

/**
 * Users - Core user accounts and authentication
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  email: varchar("email", { length: 320 }).unique(),
  name: text("name"),
  passwordHash: varchar("password_hash", { length: 255 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  insurerRole: insurerRoleEnum("insurer_role"),
  organizationId: integer("organization_id").references(() => organizations.id),
  emailVerified: boolean("email_verified").default(false).notNull(),
  
  // Assessor tier system
  assessorTier: assessorTierEnum("assessor_tier").default("free"),
  tierActivatedAt: timestamp("tier_activated_at", { withTimezone: true }),
  tierExpiresAt: timestamp("tier_expires_at", { withTimezone: true }),
  
  // Performance metrics
  performanceScore: integer("performance_score").default(70),
  totalAssessmentsCompleted: integer("total_assessments_completed").default(0),
  averageVarianceFromFinal: integer("average_variance_from_final"),
  accuracyScore: decimal("accuracy_score", { precision: 5, scale: 2 }).default("0.00"),
  avgCompletionTime: decimal("avg_completion_time", { precision: 6, scale: 2 }).default("0.00"),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Organizations - Multi-tenant organizations
 */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  organizationType: varchar("organization_type", { length: 50 }).notNull(), // insurer, fleet, assessor_firm
  
  // Contact information
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  country: varchar("country", { length: 100 }),
  
  // Subscription
  subscriptionTier: varchar("subscription_tier", { length: 50 }).default("free"),
  subscriptionStatus: varchar("subscription_status", { length: 50 }).default("active"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  
  // Limits
  maxUsers: integer("max_users").default(5),
  maxClaims: integer("max_claims").default(100),
  
  // Settings
  settings: jsonb("settings"),
  
  // Billing
  billingEmail: varchar("billing_email", { length: 320 }),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

/**
 * User Invitations - Team member invites
 */
export const userInvitations = pgTable("user_invitations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: roleEnum("role").notNull(),
  invitedBy: integer("invited_by").references(() => users.id).notNull(),
  
  // Invitation token
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: integer("accepted_by").references(() => users.id),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = typeof userInvitations.$inferInsert;

/**
 * Email Verification Tokens
 */
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

/**
 * API Keys - Service-to-service authentication
 */
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  
  // Ownership
  userId: integer("user_id").references(() => users.id),
  organizationId: integer("organization_id").references(() => organizations.id),
  serviceId: varchar("service_id", { length: 100 }), // For service-to-service keys
  
  // Permissions
  scopes: jsonb("scopes").notNull(), // Array of permission scopes
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  
  // Metadata
  metadata: jsonb("metadata"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * Sessions - Active user sessions
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  
  // Session details
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 50 }),
  
  // Expiration
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;

/**
 * Permissions - Fine-grained permissions
 */
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description"),
  resource: varchar("resource", { length: 100 }).notNull(), // claims, assessments, users, etc.
  action: varchar("action", { length: 50 }).notNull(), // create, read, update, delete
  scope: permissionScopeEnum("scope").default("self").notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = typeof permissions.$inferInsert;

/**
 * Roles - Custom role definitions
 */
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id),
  description: text("description"),
  
  // Permissions (array of permission IDs)
  permissionIds: jsonb("permission_ids").notNull(),
  
  // System role flag
  isSystemRole: boolean("is_system_role").default(false).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Role = typeof roles.$inferSelect;
export type InsertRole = typeof roles.$inferInsert;

/**
 * User Roles - Many-to-many relationship between users and roles
 */
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  roleId: integer("role_id").references(() => roles.id).notNull(),
  
  assignedBy: integer("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = typeof userRoles.$inferInsert;

/**
 * Registration Requests - Assessor registration requests
 */
export const registrationRequests = pgTable("registration_requests", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }),
  
  // Professional details
  licenseNumber: varchar("license_number", { length: 100 }),
  yearsOfExperience: integer("years_of_experience"),
  certifications: jsonb("certifications"),
  
  // Business details
  businessName: text("business_name"),
  businessAddress: text("business_address"),
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  
  // Approval
  approvedUserId: integer("approved_user_id").references(() => users.id),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RegistrationRequest = typeof registrationRequests.$inferSelect;
export type InsertRegistrationRequest = typeof registrationRequests.$inferInsert;
