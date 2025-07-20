-- Friends & Family Migration SQL
-- This script ONLY ADDS data and NEVER DELETES anything
-- It only affects users currently on free tier

-- Step 1: Add Friends & Family subscription plan (if not already exists)
INSERT INTO subscription_plans (
  name, 
  description, 
  price, 
  interval, 
  features, 
  stripe_price_id, 
  stripe_product_id, 
  is_active, 
  sort_order,
  created_at,
  updated_at
) VALUES (
  'Friends & Family',
  'Special access for friends and family members to test the full NomadAI experience',
  '0.00',
  'month',
  '["Unlimited AI interactions", "Advanced code analysis", "UI generation & cloning", "Performance insights", "Design pattern analysis", "All AI models available", "Code improvement suggestions", "Advanced debugging assistance", "Friends & Family special access"]',
  'price_1RmslfJYFJQbKiIKgGYujWWC',
  'prod_friends_family',
  true,
  0,
  NOW(),
  NOW()
) ON CONFLICT (stripe_price_id) DO NOTHING;

-- Step 2: Update ONLY free tier users to Friends & Family (preserves all paid users)
UPDATE users 
SET 
  subscription_status = 'active',
  subscription_tier = 'friends_family',
  subscription_ends_at = (NOW() + INTERVAL '1 year'),
  updated_at = NOW()
WHERE 
  subscription_tier = 'free' 
  AND subscription_status = 'free';

-- Step 3: Create subscription records for users who got Friends & Family but don't have subscription records
WITH friends_family_plan AS (
  SELECT id FROM subscription_plans WHERE name = 'Friends & Family' LIMIT 1
),
friends_family_users AS (
  SELECT id FROM users WHERE subscription_tier = 'friends_family'
)
INSERT INTO subscriptions (
  user_id,
  plan_id,
  status,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
)
SELECT 
  u.id,
  p.id,
  'active',
  NOW(),
  (NOW() + INTERVAL '1 year'),
  false,
  NOW(),
  NOW()
FROM friends_family_users u
CROSS JOIN friends_family_plan p
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.user_id = u.id
);

-- Verification queries (run these to check results)
-- SELECT name, price FROM subscription_plans WHERE name = 'Friends & Family';
-- SELECT COUNT(*) as friends_family_users FROM users WHERE subscription_tier = 'friends_family';
-- SELECT COUNT(*) as friends_family_subscriptions FROM subscriptions s 
--   JOIN subscription_plans p ON s.plan_id = p.id 
--   WHERE p.name = 'Friends & Family'; 