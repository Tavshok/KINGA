"""
Patch drizzle/schema.ts to:
1. Add verificationStatus, verifiedByUserId, verifiedAt columns to fleet_accounts table
2. Add fleetManagerRequests table after fleet_accounts type exports
"""
import sys

with open('drizzle/schema.ts', 'r') as f:
    content = f.read()

# Find the fleet_accounts section and patch it
MARKER_START = 'export const fleetAccounts = mysqlTable("fleet_accounts"'
MARKER_END = 'export type InsertFleetAccount = typeof fleetAccounts.$inferInsert;'

start_idx = content.find(MARKER_START)
end_idx = content.find(MARKER_END)

if start_idx == -1 or end_idx == -1:
    print(f'ERROR: markers not found. start={start_idx}, end={end_idx}')
    sys.exit(1)

end_idx += len(MARKER_END)
old_section = content[start_idx:end_idx]
print('Found section, length:', len(old_section))

# Build the replacement — preserve the original table but add verification columns
new_section = '''export const fleetAccounts = mysqlTable("fleet_accounts", {
  id: int().autoincrement().notNull(),
  ownerUserId: int("owner_user_id").notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountCode: varchar("account_code", { length: 50 }),
  linkedInsurerTenantId: varchar("linked_insurer_tenant_id", { length: 64 }),
  linkedAgencyId: int("linked_agency_id"),
  status: mysqlEnum(['active','suspended','pending']).notNull().default('active'),
  subscriptionTier: mysqlEnum("subscription_tier", ['free','starter','professional','enterprise']).notNull().default('free'),
  vehicleCount: int("vehicle_count").notNull().default(0),
  notes: text(),
  // Verification status — set to 'approved' once a claims manager approves the fleet manager request
  verificationStatus: mysqlEnum("verification_status", ['pending','approved','rejected']).notNull().default('pending'),
  verifiedByUserId: int("verified_by_user_id"),
  verifiedAt: timestamp("verified_at", { mode: 'string' }),
  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
  index("idx_fleet_accounts_owner").on(table.ownerUserId),
  index("idx_fleet_accounts_insurer").on(table.linkedInsurerTenantId),
  index("idx_fleet_accounts_agency").on(table.linkedAgencyId),
  index("idx_fleet_accounts_status").on(table.status),
]);
export type FleetAccount = typeof fleetAccounts.$inferSelect;
export type InsertFleetAccount = typeof fleetAccounts.$inferInsert;
// ============================================================================
// FLEET MANAGER REQUESTS — Self-registration requests awaiting claims manager approval
// When a claimant registers as fleet manager, a request row is created here.
// A claims manager reviews and approves/rejects. On approval, the user role
// is upgraded to fleet_manager and fleet_account.verification_status = 'approved'.
// ============================================================================
export const fleetManagerRequests = mysqlTable("fleet_manager_requests", {
  id: int().autoincrement().notNull(),
  userId: int("user_id").notNull(),
  fleetAccountId: int("fleet_account_id"),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  companyReg: varchar("company_reg", { length: 100 }),
  jobTitle: varchar("job_title", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 100 }),
  status: mysqlEnum(["pending","approved","rejected"]).notNull().default("pending"),
  reviewedByUserId: int("reviewed_by_user_id"),
  reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
  index("idx_fmr_user_id").on(table.userId),
  index("idx_fmr_fleet_account_id").on(table.fleetAccountId),
  index("idx_fmr_status").on(table.status),
  index("idx_fmr_created_at").on(table.createdAt),
]);
export type FleetManagerRequest = typeof fleetManagerRequests.$inferSelect;
export type InsertFleetManagerRequest = typeof fleetManagerRequests.$inferInsert;'''

content = content[:start_idx] + new_section + content[end_idx:]

with open('drizzle/schema.ts', 'w') as f:
    f.write(content)

print('SUCCESS: schema.ts patched with fleet verification columns and fleetManagerRequests table')
