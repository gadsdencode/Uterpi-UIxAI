-- Add team_id column to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS team_id integer;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_team_id ON subscriptions(team_id);