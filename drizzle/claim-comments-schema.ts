import { mysqlTable, int, text, timestamp, mysqlEnum } from "drizzle-orm/mysql-core";

/**
 * Claim Comments - Workflow collaboration and annotations
 */
export const claimComments = mysqlTable("claim_comments", {
  id: int("id").autoincrement().primaryKey(),
  claimId: int("claim_id").notNull(),
  userId: int("user_id").notNull(),
  userRole: text("user_role").notNull(), // Role at time of comment (for audit trail)
  
  commentType: mysqlEnum("comment_type", [
    "general",
    "flag",
    "clarification_request",
    "technical_note"
  ]).notNull(),
  
  content: text("content").notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ClaimComment = typeof claimComments.$inferSelect;
export type InsertClaimComment = typeof claimComments.$inferInsert;
