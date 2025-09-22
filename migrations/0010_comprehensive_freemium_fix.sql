-- Comprehensive Freemium System Fix
-- This migration addresses all subscription tier and message allowance issues

-- Step 1: Ensure subscription_features table has freemium tier with correct settings
INSERT INTO subscription_features (
  tier_name, 
  unlimited_chat, 
  monthly_message_allowance, 
  ai_providers_access, 
  monthly_ai_credits,
  max_projects, 
  full_codebase_context, 
  git_integration, 
  ai_code_reviews_per_month, 
  team_features_enabled, 
  support_level
) VALUES (
  'freemium', 
  FALSE, 
  10, 
  '["basic"]'::jsonb, 
  0, 
  1, 
  FALSE, 
  FALSE, 
  0, 
  FALSE, 
  'community'
) ON CONFLICT (tier_name) DO UPDATE SET
  unlimited_chat = FALSE,
  monthly_message_allowance = 10,
  ai_providers_access = '["basic"]'::jsonb,
  monthly_ai_credits = 0,
  max_projects = 1,
  full_codebase_context = FALSE,
  git_integration = FALSE,
  ai_code_reviews_per_month = 0,
  team_features_enabled = FALSE,
  support_level = 'community';

-- Step 2: Fix all users with invalid subscription tiers
UPDATE users 
SET 
  subscription_tier = 'freemium',
  subscription_status = 'freemium',
  updated_at = NOW()
WHERE 
  subscription_tier IS NULL 
  OR subscription_tier = '' 
  OR subscription_tier = 'free'
  OR subscription_tier NOT IN (
    SELECT tier_name FROM subscription_features
  );

-- Step 3: Initialize messages_reset_at for users who don't have it set
UPDATE users 
SET 
  messages_reset_at = DATE_TRUNC('month', CURRENT_DATE),
  updated_at = NOW()
WHERE 
  messages_reset_at IS NULL;

-- Step 4: Reset message counters for users whose reset date is in the past
UPDATE users 
SET 
  messages_used_this_month = 0,
  messages_reset_at = DATE_TRUNC('month', CURRENT_DATE),
  updated_at = NOW()
WHERE 
  messages_reset_at < DATE_TRUNC('month', CURRENT_DATE)
  OR messages_reset_at IS NULL;

-- Step 5: Ensure all users have ai_credits_balance initialized
UPDATE users 
SET 
  ai_credits_balance = COALESCE(ai_credits_balance, 0),
  updated_at = NOW()
WHERE 
  ai_credits_balance IS NULL;

-- Step 6: Create index for better performance on subscription queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_subscription_tier 
ON users(subscription_tier);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_messages_reset_at 
ON users(messages_reset_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscription_features_tier_name 
ON subscription_features(tier_name);

-- Step 7: Add constraint to prevent invalid subscription tiers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'chk_valid_subscription_tier'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT chk_valid_subscription_tier 
        CHECK (subscription_tier IN ('freemium', 'pro', 'team', 'enterprise'));
    END IF;
END $$;

-- Step 8: Create a function to automatically reset monthly counters
CREATE OR REPLACE FUNCTION reset_monthly_message_counters()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE users 
  SET 
    messages_used_this_month = 0,
    messages_reset_at = DATE_TRUNC('month', CURRENT_DATE),
    updated_at = NOW()
  WHERE 
    messages_reset_at < DATE_TRUNC('month', CURRENT_DATE)
    OR messages_reset_at IS NULL;
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Step 9: Create migration_log table if it doesn't exist and log the migration
CREATE TABLE IF NOT EXISTS migration_log (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Log the migration
INSERT INTO migration_log (migration_name, executed_at, details)
VALUES (
  '0010_comprehensive_freemium_fix',
  NOW(),
  'Comprehensive fix for freemium system: fixed subscription tiers, reset logic, and added performance indexes'
);

-- Step 10: Verification queries
SELECT 
  'Users by Subscription Tier' as report_type,
  subscription_tier,
  subscription_status,
  COUNT(*) as user_count,
  AVG(COALESCE(messages_used_this_month, 0)) as avg_messages_used,
  COUNT(CASE WHEN messages_reset_at IS NULL THEN 1 END) as users_without_reset_date
FROM users 
GROUP BY subscription_tier, subscription_status
ORDER BY subscription_tier;

SELECT 
  'Subscription Features' as report_type,
  tier_name,
  monthly_message_allowance,
  unlimited_chat,
  monthly_ai_credits
FROM subscription_features 
ORDER BY tier_name;

SELECT 
  'Monthly Reset Status' as report_type,
  COUNT(CASE WHEN messages_reset_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as current_month_resets,
  COUNT(CASE WHEN messages_reset_at < DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) as outdated_resets,
  COUNT(CASE WHEN messages_reset_at IS NULL THEN 1 END) as null_resets
FROM users;
