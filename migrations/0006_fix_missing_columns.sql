-- Migration: Fix missing columns in existing tables
-- This migration adds missing columns that were referenced in code but not created

-- Add missing columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS ai_credits_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_credits_used_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS messages_used_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS messages_reset_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS team_id INTEGER,
ADD COLUMN IF NOT EXISTS team_role TEXT,
ADD COLUMN IF NOT EXISTS is_grandfathered BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS grandfathered_from_tier TEXT,
ADD COLUMN IF NOT EXISTS grandfathered_at TIMESTAMP;

-- Add missing columns to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS team_id INTEGER,
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add missing columns to subscription_features table
ALTER TABLE subscription_features 
ADD COLUMN IF NOT EXISTS monthly_message_allowance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_providers_access TEXT[],
ADD COLUMN IF NOT EXISTS monthly_ai_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS credits_rollover BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS credits_purchase_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS max_projects INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS full_codebase_context BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS git_integration BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ai_code_reviews_per_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS team_features_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shared_workspaces BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS team_personas BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sso_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS audit_logs BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS data_residency BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'email';

-- Create teams table if it doesn't exist
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id INTEGER REFERENCES users(id) NOT NULL,
  subscription_tier TEXT NOT NULL,
  max_members INTEGER NOT NULL DEFAULT 3,
  current_members INTEGER DEFAULT 1,
  pooled_ai_credits INTEGER DEFAULT 0,
  pooled_credits_used_this_month INTEGER DEFAULT 0,
  shared_workspaces_count INTEGER DEFAULT 0,
  max_workspaces INTEGER DEFAULT 10,
  custom_personas_count INTEGER DEFAULT 0,
  sso_enabled BOOLEAN DEFAULT FALSE,
  audit_logs_enabled BOOLEAN DEFAULT FALSE,
  data_residency_region TEXT,
  dedicated_account_manager TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create ai_credits_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS ai_credits_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) NOT NULL,
  team_id INTEGER REFERENCES teams(id),
  transaction_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  operation_type TEXT,
  model_used TEXT,
  tokens_consumed INTEGER,
  stripe_payment_intent_id TEXT,
  purchase_amount_cents INTEGER,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add foreign key constraint for team_id in users table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_user_team' 
        AND table_name = 'users'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT fk_user_team 
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for team_id in subscriptions table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_subscription_team' 
        AND table_name = 'subscriptions'
    ) THEN
        ALTER TABLE subscriptions 
        ADD CONSTRAINT fk_subscription_team 
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_credits_transactions_user_id ON ai_credits_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_credits_transactions_team_id ON ai_credits_transactions(team_id);
CREATE INDEX IF NOT EXISTS idx_ai_credits_transactions_created_at ON ai_credits_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_team_id ON subscriptions(team_id);

-- Update existing users to freemium tier if they are currently on 'free'
UPDATE users 
SET subscription_tier = 'freemium', subscription_status = 'freemium'
WHERE subscription_tier = 'free' OR subscription_tier IS NULL;

-- Insert feature configurations for each tier (only if they don't exist)
INSERT INTO subscription_features (
  tier_name, unlimited_chat, monthly_message_allowance, ai_providers_access, monthly_ai_credits,
  max_projects, full_codebase_context, git_integration, 
  ai_code_reviews_per_month, team_features_enabled, support_level
) 
SELECT * FROM (VALUES 
-- Freemium tier (new default - 10 messages per month, no credits)
('freemium', FALSE, 10, ARRAY['basic'], 0, 1, FALSE, FALSE, 0, FALSE, 'community'),

-- Pro tier ($19/month)
('pro', TRUE, 0, ARRAY['openai', 'anthropic', 'gemini', 'azure'], 0, 
 1, TRUE, TRUE, 10, FALSE, 'email'),

-- Team tier ($49/user/month, min 3 users)
('team', TRUE, 0, ARRAY['openai', 'anthropic', 'gemini', 'azure', 'custom'], 0,
 10, TRUE, TRUE, 100, TRUE, 'priority_email'),

-- Enterprise tier (custom pricing)
('enterprise', TRUE, 0, ARRAY['all'], 0,
 999999, TRUE, TRUE, 999999, TRUE, 'dedicated')
) AS v(tier_name, unlimited_chat, monthly_message_allowance, ai_providers_access, monthly_ai_credits,
       max_projects, full_codebase_context, git_integration, 
       ai_code_reviews_per_month, team_features_enabled, support_level)
WHERE NOT EXISTS (SELECT 1 FROM subscription_features WHERE tier_name = v.tier_name);

-- Insert new subscription plans (only if they don't exist)
INSERT INTO subscription_plans (
  name, description, price, interval, features, 
  stripe_price_id, stripe_product_id, is_active, sort_order
) 
SELECT * FROM (VALUES 
-- Freemium Plan
(
  'Freemium',
  'Start free with 10 messages per month',
  '0.00',
  'month',
  '["10 Messages per Month", "Basic AI Models", "1 Project", "Community Support", "Upgrade Anytime"]',
  'price_freemium',
  'prod_freemium',
  true,
  1
),
-- Pro Plan
(
  'Pro',
  'Perfect for individual developers and freelancers',
  '19.00',
  'month',
  '["Unlimited Chat & AI Providers", "Pay-as-you-go AI Credits", "Full-Codebase Context (1 Project)", "Git Integration", "10 AI Code Reviews/month", "Email Support"]',
  'price_pro_v2_monthly',
  'prod_pro_v2',
  true,
  2
),
-- Team Plan
(
  'Team', 
  'Built for startups and small to mid-sized teams',
  '49.00',
  'month',
  '["Everything in Pro", "10 Projects per user", "100 AI Code Reviews per user/month", "Shared Workspaces", "Team Personas", "Priority Email Support"]',
  'price_team_v2_monthly',
  'prod_team_v2',
  true,
  3
),
-- Enterprise Plan
(
  'Enterprise',
  'Advanced features for large organizations',
  '0.00',
  'month', 
  '["Everything in Team", "Unlimited Projects", "Unlimited AI Code Reviews", "SAML SSO", "Audit Logs", "Data Residency Options", "Dedicated Account Manager"]',
  'price_enterprise_v2_custom',
  'prod_enterprise_v2',
  true,
  4
)
) AS v(name, description, price, interval, features, stripe_price_id, stripe_product_id, is_active, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = v.name);

-- Create function to reset monthly credits and messages
CREATE OR REPLACE FUNCTION reset_monthly_credits() RETURNS void AS $$
BEGIN
  -- Reset individual user credits and messages
  UPDATE users 
  SET 
    ai_credits_balance = sf.monthly_ai_credits,
    ai_credits_used_this_month = 0,
    messages_used_this_month = 0,
    credits_reset_at = NOW(),
    messages_reset_at = NOW()
  FROM subscription_features sf
  WHERE users.subscription_tier = sf.tier_name
    AND users.team_id IS NULL;
  
  -- Reset team pooled credits
  UPDATE teams t
  SET 
    pooled_ai_credits = sf.monthly_ai_credits * t.current_members,
    pooled_credits_used_this_month = 0
  FROM subscription_features sf
  WHERE t.subscription_tier = sf.tier_name;
  
  -- Log the reset as transactions (only for users with credits)
  INSERT INTO ai_credits_transactions (user_id, transaction_type, amount, balance_after, description)
  SELECT 
    id, 
    'monthly_reset',
    sf.monthly_ai_credits,
    sf.monthly_ai_credits,
    'Monthly credits reset'
  FROM users u
  JOIN subscription_features sf ON u.subscription_tier = sf.tier_name
  WHERE u.team_id IS NULL AND sf.monthly_ai_credits > 0;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update team member count
CREATE OR REPLACE FUNCTION update_team_member_count() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    UPDATE teams 
    SET current_members = (
      SELECT COUNT(*) FROM users WHERE team_id = NEW.team_id
    )
    WHERE id = NEW.team_id;
  END IF;
  
  IF OLD.team_id IS NOT NULL AND OLD.team_id != NEW.team_id THEN
    UPDATE teams 
    SET current_members = (
      SELECT COUNT(*) FROM users WHERE team_id = OLD.team_id
    )
    WHERE id = OLD.team_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'trigger_update_team_members'
    ) THEN
        CREATE TRIGGER trigger_update_team_members
        AFTER INSERT OR UPDATE OR DELETE ON users
        FOR EACH ROW EXECUTE FUNCTION update_team_member_count();
    END IF;
END $$;
