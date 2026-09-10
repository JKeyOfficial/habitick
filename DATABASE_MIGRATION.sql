-- Comprehensive Database Migration Script for HabiTick
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)

-- 1. Create routines table if it doesn't exist
CREATE TABLE IF NOT EXISTS routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📋',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on routines
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own routines' AND tablename = 'routines') THEN
    CREATE POLICY "Users can manage their own routines" ON routines FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Add order_index column to routines if it doesn't exist
ALTER TABLE routines ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_routines_user_id_order_index ON routines(user_id, order_index);

-- 2. Ensure columns on habits table
ALTER TABLE habits ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS routine_id UUID REFERENCES routines(id) ON DELETE SET NULL;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS reminder_time TEXT;

UPDATE habits SET order_index = COALESCE(order_index, 0) WHERE order_index IS NULL;
CREATE INDEX IF NOT EXISTS idx_habits_user_id_order_index ON habits(user_id, order_index);

-- 3. Ensure columns on profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS habit_order JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS routine_order JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purchased_shields INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_persona_encrypted TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_suggestions_encrypted TEXT;

-- 4. Create goals table for long term goals
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create their own goals' AND tablename = 'goals') THEN
    CREATE POLICY "Users can create their own goals" ON goals FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own goals' AND tablename = 'goals') THEN
    CREATE POLICY "Users can view their own goals" ON goals FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own goals' AND tablename = 'goals') THEN
    CREATE POLICY "Users can update their own goals" ON goals FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own goals' AND tablename = 'goals') THEN
    CREATE POLICY "Users can delete their own goals" ON goals FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Cross-device theme preference on profiles (dark/light)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';

-- 6. Standalone Docs / Journaling companion table (docs.habitick.app)
CREATE TABLE IF NOT EXISTS docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tag TEXT DEFAULT 'General',
  is_pinned BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  word_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE docs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own docs' AND tablename = 'docs') THEN
    CREATE POLICY "Users can manage their own docs" ON docs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_docs_user_id_updated ON docs(user_id, updated_at DESC);

-- 7. Security Hardening: Prevent client-side privilege escalation on profiles
-- Revoke direct client update permissions on sensitive billing & role columns.
-- These columns can only be modified by the Stripe webhook (service_role) or server functions.
DO $$ BEGIN
  REVOKE UPDATE (is_premium, is_lifetime, is_admin, stripe_customer_id, stripe_subscription_id) ON profiles FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL; -- Ignore if columns or permissions are already constrained
END $$;

