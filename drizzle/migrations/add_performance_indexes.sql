-- Performance Indexes Migration
-- Created: 2026-02-18
-- Purpose: Add composite indexes to improve query performance for analytics and dashboard queries
-- Impact: Non-breaking, read-only schema enhancement

-- Index 1: Claims tenant + status lookup
-- Benefits: Speeds up filtered claims lists (dashboard, triage)
-- Usage: WHERE tenant_id = ? AND status = ?
CREATE INDEX IF NOT EXISTS idx_claims_tenant_status 
ON claims(tenant_id, status);

-- Index 2: Workflow audit trail claim + timestamp
-- Benefits: Faster audit trail retrieval sorted by time
-- Usage: WHERE claim_id = ? ORDER BY timestamp DESC
CREATE INDEX IF NOT EXISTS idx_audit_claim_timestamp 
ON workflow_audit_trail(claim_id, created_at DESC);

-- Index 3: Claim routing decisions claim + decision
-- Benefits: Faster routing analytics and decision lookups
-- Usage: WHERE claim_id = ? AND routing_decision = ?
CREATE INDEX IF NOT EXISTS idx_routing_claim_decision 
ON claim_routing_decisions(claim_id, routing_decision);

-- Index 4: AI assessments claim + confidence score
-- Benefits: Faster confidence score analytics
-- Usage: WHERE claim_id = ? ORDER BY confidence_score DESC
CREATE INDEX IF NOT EXISTS idx_ai_claim_confidence 
ON ai_assessments(claim_id, confidence_score DESC);

-- Index 5: Claims tenant + created_at (for time-series queries)
-- Benefits: Speeds up trend analysis and date-filtered queries
-- Usage: WHERE tenant_id = ? AND created_at >= ? ORDER BY created_at
CREATE INDEX IF NOT EXISTS idx_claims_tenant_created 
ON claims(tenant_id, created_at DESC);

-- Index 6: AI assessments tenant + fraud_risk_level (for fraud analytics)
-- Benefits: Speeds up fraud distribution queries
-- Usage: WHERE tenant_id = ? GROUP BY fraud_risk_level
CREATE INDEX IF NOT EXISTS idx_ai_tenant_fraud 
ON ai_assessments(tenant_id, fraud_risk_level);

-- Verification query (run after migration to confirm indexes exist)
-- SHOW INDEX FROM claims WHERE Key_name LIKE 'idx_%';
-- SHOW INDEX FROM workflow_audit_trail WHERE Key_name LIKE 'idx_%';
-- SHOW INDEX FROM claim_routing_decisions WHERE Key_name LIKE 'idx_%';
-- SHOW INDEX FROM ai_assessments WHERE Key_name LIKE 'idx_%';
