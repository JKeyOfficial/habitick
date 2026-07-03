-- Add order_index column to routines table for drag-and-drop reordering
-- Run this in your Supabase SQL editor

-- Add the order_index column if it doesn't exist
ALTER TABLE routines ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Set a sensible default ordering based on creation date for existing routines
UPDATE routines 
SET order_index = COALESCE(order_index, 0)
WHERE order_index IS NULL;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_routines_user_id_order_index 
ON routines(user_id, order_index);

-- Add is_admin column to profiles table for developer access checks
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add purchased_shields column to profiles table for XP system
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purchased_shields INTEGER DEFAULT 0;

-- Create goals table for long term goals
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

-- Enable Row Level Security (RLS)
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- Create Policies
CREATE POLICY "Users can create their own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);
