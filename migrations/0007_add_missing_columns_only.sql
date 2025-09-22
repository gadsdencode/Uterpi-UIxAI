-- Migration: Add only missing columns to existing tables
-- This migration ONLY adds missing columns, no table creation

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
