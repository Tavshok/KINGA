-- Rate Limit Tracking Table
-- Tracks AI rerun actions per user per tenant for rate limiting enforcement

CREATE TABLE IF NOT EXISTS rate_limit_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  tenant_id VARCHAR(64) NOT NULL,
  action_type VARCHAR(50) NOT NULL, -- 'ai_rerun', 'confidence_recalc', 'routing_reevaluation'
  window_start TIMESTAMP NOT NULL, -- Start of the current hour window
  action_count INT NOT NULL DEFAULT 1, -- Number of actions in this window
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_user_tenant_action_window (user_id, tenant_id, action_type, window_start),
  INDEX idx_window_start (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
