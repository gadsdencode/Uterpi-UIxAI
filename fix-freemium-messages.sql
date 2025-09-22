-- Fix freemium users to have proper message allowance
-- This ensures all freemium users get their 10 messages per month

-- First, ensure the freemium tier exists in subscription_features with 10 messages
INSERT INTO subscription_features (
  tier_name, unlimited_chat, monthly_message_allowance, ai_providers_access, monthly_ai_credits,
  max_projects, full_codebase_context, git_integration, 
  ai_code_reviews_per_month, team_features_enabled, support_level
) VALUES (
  'freemium', FALSE, 10, '["basic"]'::jsonb, 0, 1, FALSE, FALSE, 0, FALSE, 'community'
) ON CONFLICT (tier_name) DO UPDATE SET
  monthly_message_allowance = 10,
  unlimited_chat = FALSE,
  ai_providers_access = '["basic"]'::jsonb,
  monthly_ai_credits = 0,
  max_projects = 1,
  full_codebase_context = FALSE,
  git_integration = FALSE,
  ai_code_reviews_per_month = 0,
  team_features_enabled = FALSE,
  support_level = 'community';

-- Set all users without a tier to freemium
UPDATE users 
SET 
  subscription_tier = 'freemium',
  subscription_status = 'freemium',
  updated_at = NOW()
WHERE subscription_tier IS NULL OR subscription_tier = '' OR subscription_tier = 'free';

-- Reset message usage for all freemium users to give them their monthly allowance
UPDATE users 
SET 
  messages_used_this_month = 0,
  messages_reset_at = NOW(),
  updated_at = NOW()
WHERE subscription_tier = 'freemium';

-- Verify the fix
SELECT 
  'Users Table' as table_name,
  subscription_tier,
  COUNT(*) as user_count,
  AVG(messages_used_this_month) as avg_messages_used,
  MIN(messages_used_this_month) as min_messages_used,
  MAX(messages_used_this_month) as max_messages_used
FROM users 
WHERE subscription_tier = 'freemium'
GROUP BY subscription_tier

UNION ALL

SELECT 
  'Subscription Features' as table_name,
  tier_name as subscription_tier,
  monthly_message_allowance as user_count,
  NULL as avg_messages_used,
  NULL as min_messages_used,
  NULL as max_messages_used
FROM subscription_features 
WHERE tier_name = 'freemium';
