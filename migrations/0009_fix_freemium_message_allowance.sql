-- Migration: Fix freemium users to have proper message allowance
-- This ensures all freemium users get their 10 messages per month

-- First, ensure all users without a tier are set to freemium
UPDATE users 
SET 
  subscription_tier = 'freemium',
  subscription_status = 'freemium',
  updated_at = NOW()
WHERE subscription_tier IS NULL OR subscription_tier = '';

-- Reset message usage for all freemium users to give them their monthly allowance
UPDATE users 
SET 
  messages_used_this_month = 0,
  messages_reset_at = NOW(),
  updated_at = NOW()
WHERE subscription_tier = 'freemium';

-- Log the migration
INSERT INTO migration_log (migration_name, executed_at, details)
VALUES (
  '0009_fix_freemium_message_allowance',
  NOW(),
  'Reset message usage for all freemium users to provide their monthly allowance'
);

-- Verify the migration
SELECT 
  subscription_tier,
  COUNT(*) as user_count,
  AVG(messages_used_this_month) as avg_messages_used
FROM users 
WHERE subscription_tier = 'freemium'
GROUP BY subscription_tier;
