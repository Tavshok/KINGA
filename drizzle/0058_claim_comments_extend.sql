-- Extend claim_comments table for full cross-role communication system
-- Adds: routing (toRoles, toUserIds, toEmails), threading (parentCommentId),
--       resolution tracking, email notification flag, response deadline,
--       author role rename, comment type expansion.

-- 1. Rename existing columns to match new schema
ALTER TABLE claim_comments
  CHANGE COLUMN `userId` `author_user_id` INT NOT NULL,
  CHANGE COLUMN `userRole` `author_role` VARCHAR(50) NOT NULL,
  CHANGE COLUMN `content` `body` TEXT NOT NULL,
  CHANGE COLUMN `commentType` `comment_type` ENUM(
    'clarification','instruction','escalation',
    'approval_note','rejection_note','inspection_request','general'
  ) NOT NULL DEFAULT 'general';

-- 2. Add routing columns
ALTER TABLE claim_comments
  ADD COLUMN `to_roles`   TEXT NOT NULL DEFAULT '[]' AFTER `author_role`,
  ADD COLUMN `to_user_ids` TEXT NOT NULL DEFAULT '[]' AFTER `to_roles`,
  ADD COLUMN `to_emails`  TEXT NOT NULL DEFAULT '[]' AFTER `to_user_ids`;

-- 3. Add threading columns
ALTER TABLE claim_comments
  ADD COLUMN `parent_comment_id` INT NULL AFTER `body`,
  ADD COLUMN `is_resolved`       TINYINT NOT NULL DEFAULT 0 AFTER `parent_comment_id`,
  ADD COLUMN `resolved_by_user_id` INT NULL AFTER `is_resolved`,
  ADD COLUMN `resolved_at`       VARCHAR(50) NULL AFTER `resolved_by_user_id`;

-- 4. Add response deadline + email flag
ALTER TABLE claim_comments
  ADD COLUMN `requires_response`    TINYINT NOT NULL DEFAULT 0 AFTER `comment_type`,
  ADD COLUMN `response_deadline_at` VARCHAR(50) NULL AFTER `requires_response`,
  ADD COLUMN `email_sent`           TINYINT NOT NULL DEFAULT 0 AFTER `resolved_at`;

-- 5. Normalise createdAt to varchar for consistency with rest of schema
-- (leave as timestamp — existing data is safe, varchar conversion not needed)

-- 6. Add indexes
ALTER TABLE claim_comments
  ADD INDEX `idx_cc_author_user_id` (`author_user_id`),
  ADD INDEX `idx_cc_parent_comment_id` (`parent_comment_id`);
