import { mysqlTable, int, text, varchar, tinyint, mysqlEnum, index, uniqueIndex } from "drizzle-orm/mysql-core";

export const claimComments = mysqlTable("claim_comments", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claimId").notNull(),
  tenantId: varchar("tenant_id", { length: 255 }),
  authorUserId: int("author_user_id").notNull(),
  authorRole: varchar("author_role", { length: 50 }).notNull(),
  toRoles:   text("to_roles").notNull(),
  toUserIds: text("to_user_ids").notNull(),
  toEmails:  text("to_emails").notNull(),
  commentType: mysqlEnum("comment_type", [
    "clarification","instruction","escalation",
    "approval_note","rejection_note","inspection_request","general",
  ]).notNull().default("general"),
  requiresResponse:   tinyint("requires_response").notNull().default(0),
  responseDeadlineAt: varchar("response_deadline_at", { length: 50 }),
  body: text("body").notNull(),
  parentCommentId: int("parent_comment_id"),
  isResolved:       tinyint("is_resolved").notNull().default(0),
  resolvedByUserId: int("resolved_by_user_id"),
  resolvedAt:       varchar("resolved_at", { length: 50 }),
  emailSent: tinyint("email_sent").notNull().default(0),
  notifyClaimant: tinyint("notify_claimant").notNull().default(0),
  claimantEmailSent: tinyint("claimant_email_sent").notNull().default(0),
  statusUpdateTemplate: varchar("status_update_template", { length: 100 }),
  createdAt: varchar("createdAt", { length: 50 }).notNull(),
  deletedAt: varchar("deletedAt", { length: 50 }),
}, (table) => [
  index("idx_cc_claim_id").on(table.claimId),
  index("idx_cc_tenant_id").on(table.tenantId),
  index("idx_cc_author_user_id").on(table.authorUserId),
  index("idx_cc_parent_comment_id").on(table.parentCommentId),
]);

export type ClaimCommentRow = typeof claimComments.$inferSelect;
export type InsertClaimComment = typeof claimComments.$inferInsert;

export const claimCommentReads = mysqlTable("claim_comment_reads", {
  id: int("id").autoincrement().primaryKey(),
  commentId: int("comment_id").notNull(),
  userId: int("user_id").notNull(),
  readAt: varchar("read_at", { length: 50 }).notNull(),
}, (table) => [
  index("idx_ccr_comment_id").on(table.commentId),
  index("idx_ccr_user_id").on(table.userId),
  uniqueIndex("uq_ccr_comment_user").on(table.commentId, table.userId),
]);

export type ClaimCommentReadRow = typeof claimCommentReads.$inferSelect;
