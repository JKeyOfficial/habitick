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
