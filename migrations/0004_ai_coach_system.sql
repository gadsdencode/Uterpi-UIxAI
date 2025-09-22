-- AI Coach Workflow Tracking System Migration
-- This migration adds tables for the AI Coach system

-- Workflow tracking table for AI Coach analysis
CREATE TABLE IF NOT EXISTS workflow_tracking (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id TEXT NOT NULL,
  
  -- Workflow identification
  workflow_type TEXT,
  workflow_name TEXT,
  
  -- Workflow state
  status TEXT DEFAULT 'active',
  
  -- Workflow metrics
  total_steps INTEGER DEFAULT 0,
  completed_steps INTEGER DEFAULT 0,
  
  -- Command and model usage patterns (JSON)
  command_sequence JSON,
  model_switch_patterns JSON,
  
  -- Time tracking
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  total_duration INTEGER,
  active_time INTEGER,
  
  -- Efficiency metrics
  efficiency_score INTEGER,
  complexity_level TEXT,
  
  -- AI Coach analysis (JSON)
  coach_analysis JSON,
  last_analyzed_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Coach insights table
CREATE TABLE IF NOT EXISTS ai_coach_insights (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  workflow_id INTEGER REFERENCES workflow_tracking(id),
  
  -- Insight details
  insight_type TEXT NOT NULL,
  insight_category TEXT NOT NULL,
  
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Actionable recommendations (JSON)
  recommendations JSON,
  
  -- Context and triggers (JSON)
  trigger_context JSON,
  applicable_scenarios JSON,
  
  -- User interaction
  was_shown BOOLEAN DEFAULT false,
  was_acted_upon BOOLEAN DEFAULT false,
  user_feedback TEXT,
  feedback_details TEXT,
  
  -- Impact tracking
  expected_impact TEXT,
  actual_impact TEXT,
  impact_metrics JSON,
  
  -- Timing
  generated_at TIMESTAMP DEFAULT NOW(),
  shown_at TIMESTAMP,
  acted_at TIMESTAMP,
  expires_at TIMESTAMP,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workflow patterns table for learning user behaviors
CREATE TABLE IF NOT EXISTS workflow_patterns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  
  -- Pattern identification
  pattern_name TEXT NOT NULL,
  pattern_type TEXT NOT NULL,
  
  -- Pattern data (JSON)
  pattern_data JSON NOT NULL,
  frequency INTEGER DEFAULT 1,
  confidence DECIMAL(3, 2),
  
  -- Learning metrics
  first_observed_at TIMESTAMP DEFAULT NOW(),
  last_observed_at TIMESTAMP DEFAULT NOW(),
  observation_count INTEGER DEFAULT 1,
  
  -- Pattern effectiveness
  success_rate DECIMAL(3, 2),
  avg_time_to_complete INTEGER,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI Coach conversations table for contextual coaching
CREATE TABLE IF NOT EXISTS ai_coach_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  
  -- Conversation context
  conversation_context TEXT NOT NULL,
  
  -- Messages (JSON)
  messages JSON NOT NULL,
  
  -- Outcomes
  resolution_status TEXT,
  user_satisfaction INTEGER,
  
  -- Metadata
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_workflow_tracking_user_session ON workflow_tracking(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tracking_status ON workflow_tracking(status);
CREATE INDEX IF NOT EXISTS idx_ai_coach_insights_user ON ai_coach_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_coach_insights_shown ON ai_coach_insights(was_shown);
CREATE INDEX IF NOT EXISTS idx_workflow_patterns_user ON workflow_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_coach_conversations_user ON ai_coach_conversations(user_id);
