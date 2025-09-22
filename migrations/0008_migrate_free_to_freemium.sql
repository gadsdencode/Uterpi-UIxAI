-- Migration: Update all 'free' tier users to 'freemium' tier
-- This ensures consistency with the new tier system

-- Update users with 'free' tier to 'freemium'
UPDATE users 
SET 
  subscription_tier = 'freemium',
  subscription_status = 'freemium',
  updated_at = NOW()
WHERE subscription_tier = 'free' OR subscription_tier IS NULL;

-- Log the migration
INSERT INTO migration_log (migration_name, executed_at, details)
VALUES (
  '0008_migrate_free_to_freemium',
  NOW(),
  'Updated all users with free tier to freemium tier for consistency'
);

-- Verify the migration
SELECT 
  subscription_tier,
  COUNT(*) as user_count
FROM users 
GROUP BY subscription_tier
ORDER BY subscription_tier;
