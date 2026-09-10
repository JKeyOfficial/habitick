-- ====================================================================
-- HabiTick Docs: Strict Security & Row Level Security (RLS) Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ====================================================================

-- 1. Ensure the 'docs' table exists with all required columns
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

-- 2. Force Row Level Security (enforced for all roles, including table owners)
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs FORCE ROW LEVEL SECURITY;

-- 3. Clean up legacy or generic policies if they exist
DROP POLICY IF EXISTS "Users can manage their own docs" ON docs;
DROP POLICY IF EXISTS "Users can only select their own docs" ON docs;
DROP POLICY IF EXISTS "Users can only insert their own docs" ON docs;
DROP POLICY IF EXISTS "Users can only update their own docs" ON docs;
DROP POLICY IF EXISTS "Users can only delete their own docs" ON docs;

-- 4. Create granular, segregated Zero-Trust CRUD policies

-- SELECT: Students can strictly read their own documents only
CREATE POLICY "Users can only select their own docs"
  ON docs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: Students can strictly insert documents bound to their authenticated UID
CREATE POLICY "Users can only insert their own docs"
  ON docs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Students can strictly modify their own documents and cannot reassign ownership
CREATE POLICY "Users can only update their own docs"
  ON docs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Students can strictly delete their own documents only
CREATE POLICY "Users can only delete their own docs"
  ON docs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. Revoke anonymous / public access and grant strictly to authenticated role
REVOKE ALL ON docs FROM anon;
REVOKE ALL ON docs FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON docs TO authenticated;

-- 6. Add high-performance indexes for fast encrypted lookups
CREATE INDEX IF NOT EXISTS idx_docs_user_id_updated ON docs(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_user_pinned ON docs(user_id, is_pinned, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_tag ON docs(user_id, tag);
