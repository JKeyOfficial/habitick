-- RUN THIS IN YOUR SUPABASE SQL EDITOR

-- 1. Add notification settings to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT FALSE;

-- 2. Add reminder_time to habits
-- We use TEXT for time to avoid timezone complexities with native TIME types in some Edge function libraries
ALTER TABLE habits ADD COLUMN IF NOT EXISTS reminder_time TEXT;

-- 3. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subscription)
);

-- 4. Create an index for faster lookup during notification runs
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
