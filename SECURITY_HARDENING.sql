-- ==============================================================================
-- SECURITY HARDENING MIGRATION
-- Prevents client-side privilege escalation, enforces database RLS,
-- secures push notifications, and restricts storage access
-- ==============================================================================

-- 1. Function and Trigger: Prevent authenticated and anon clients from modifying
--    privileged profile columns directly via Supabase client libraries.
CREATE OR REPLACE FUNCTION public.prevent_client_privilege_escalation()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  -- Check if the action is performed by an authenticated or anon user role
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    IF TG_OP = 'UPDATE' THEN
      IF (
        (NEW.is_premium IS DISTINCT FROM OLD.is_premium) OR
        (NEW.is_lifetime IS DISTINCT FROM OLD.is_lifetime) OR
        (NEW.is_admin IS DISTINCT FROM OLD.is_admin) OR
        (NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id) OR
        (NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id) OR
        (NEW.user_number IS DISTINCT FROM OLD.user_number) OR
        (NEW.purchased_shields IS DISTINCT FROM COALESCE(OLD.purchased_shields, 0))
      ) THEN
        RAISE EXCEPTION 'Modification of privileged profile fields is not permitted from client sessions';
      END IF;
    ELSIF TG_OP = 'INSERT' THEN
      -- On insert, prevent non-default privileged values
      IF (
        (COALESCE(NEW.is_premium, FALSE) = TRUE) OR
        (COALESCE(NEW.is_lifetime, FALSE) = TRUE) OR
        (COALESCE(NEW.is_admin, FALSE) = TRUE) OR
        (NEW.stripe_customer_id IS NOT NULL) OR
        (NEW.stripe_subscription_id IS NOT NULL) OR
        (NEW.user_number IS NOT NULL) OR
        (COALESCE(NEW.purchased_shields, 0) > 0)
      ) THEN
        RAISE EXCEPTION 'Setting privileged profile fields on creation is not permitted from client sessions';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_privilege_escalation
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW 
  EXECUTE FUNCTION public.prevent_client_privilege_escalation();


-- 2. Trigger: Automatically keep is_premium in sync when is_lifetime is set.
--    Runs as a DB trigger so the client never needs to write is_premium: true.
CREATE OR REPLACE FUNCTION public.sync_lifetime_to_premium()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
BEGIN
  IF NEW.is_lifetime = TRUE AND COALESCE(NEW.is_premium, FALSE) = FALSE THEN
    NEW.is_premium := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lifetime_premium ON public.profiles;
CREATE TRIGGER trg_sync_lifetime_premium
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW 
  EXECUTE FUNCTION public.sync_lifetime_to_premium();


-- ==============================================================================
-- 3. COMPREHENSIVE ROW LEVEL SECURITY (RLS) POLICIES
-- Enforce strict data isolation: users can only view and modify their own records.
-- ==============================================================================

-- A. PROFILES TABLE
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- B. HABITS TABLE
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can insert their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can update their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can delete their own habits" ON public.habits;

CREATE POLICY "Users can view their own habits"
  ON public.habits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habits"
  ON public.habits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habits"
  ON public.habits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habits"
  ON public.habits FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- C. HABIT COMPLETIONS TABLE
ALTER TABLE public.habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_completions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own habit completions" ON public.habit_completions;
DROP POLICY IF EXISTS "Users can insert their own habit completions" ON public.habit_completions;
DROP POLICY IF EXISTS "Users can update their own habit completions" ON public.habit_completions;
DROP POLICY IF EXISTS "Users can delete their own habit completions" ON public.habit_completions;

CREATE POLICY "Users can view their own habit completions"
  ON public.habit_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit completions"
  ON public.habit_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit completions"
  ON public.habit_completions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit completions"
  ON public.habit_completions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- D. TODOS / TASKS TABLE
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can insert their own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can update their own todos" ON public.todos;
DROP POLICY IF EXISTS "Users can delete their own todos" ON public.todos;

CREATE POLICY "Users can view their own todos"
  ON public.todos FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own todos"
  ON public.todos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own todos"
  ON public.todos FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own todos"
  ON public.todos FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- E. JOURNAL ENTRIES TABLE
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can insert their own journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can update their own journal entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can delete their own journal entries" ON public.journal_entries;

CREATE POLICY "Users can view their own journal entries"
  ON public.journal_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal entries"
  ON public.journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal entries"
  ON public.journal_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal entries"
  ON public.journal_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- F. PAUSE PERIODS TABLE
ALTER TABLE public.pause_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pause_periods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own pause periods" ON public.pause_periods;
DROP POLICY IF EXISTS "Users can insert their own pause periods" ON public.pause_periods;
DROP POLICY IF EXISTS "Users can update their own pause periods" ON public.pause_periods;
DROP POLICY IF EXISTS "Users can delete their own pause periods" ON public.pause_periods;

CREATE POLICY "Users can view their own pause periods"
  ON public.pause_periods FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pause periods"
  ON public.pause_periods FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pause periods"
  ON public.pause_periods FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pause periods"
  ON public.pause_periods FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- G. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, subscription)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Users can view their own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON public.push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- H. ROUTINES TABLE
ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own routines" ON public.routines;
DROP POLICY IF EXISTS "Users can view their own routines" ON public.routines;
DROP POLICY IF EXISTS "Users can insert their own routines" ON public.routines;
DROP POLICY IF EXISTS "Users can update their own routines" ON public.routines;
DROP POLICY IF EXISTS "Users can delete their own routines" ON public.routines;

CREATE POLICY "Users can view their own routines"
  ON public.routines FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own routines"
  ON public.routines FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own routines"
  ON public.routines FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own routines"
  ON public.routines FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- I. GOALS TABLE
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can view their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update their own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete their own goals" ON public.goals;

CREATE POLICY "Users can view their own goals"
  ON public.goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own goals"
  ON public.goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals"
  ON public.goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals"
  ON public.goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- J. DOCS TABLE
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'docs') THEN
    ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.docs FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can manage their own docs" ON public.docs;
    DROP POLICY IF EXISTS "Users can only select their own docs" ON public.docs;
    DROP POLICY IF EXISTS "Users can only insert their own docs" ON public.docs;
    DROP POLICY IF EXISTS "Users can only update their own docs" ON public.docs;
    DROP POLICY IF EXISTS "Users can only delete their own docs" ON public.docs;

    CREATE POLICY "Users can only select their own docs"
      ON public.docs FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);

    CREATE POLICY "Users can only insert their own docs"
      ON public.docs FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can only update their own docs"
      ON public.docs FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users can only delete their own docs"
      ON public.docs FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;



-- ==============================================================================
-- 4. STORAGE POLICIES FOR AVATARS BUCKET
-- Protects user avatar files from unauthorized writes and path traversal
-- ==============================================================================

-- Create the avatars bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Clean up any existing avatar storage policies
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- 1. Avatars are readable by everyone (public profile photo)
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- 2. Users can only upload an avatar into their own user folder: <uid>/avatar.<ext>
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Users can only update/overwrite an avatar in their own user folder
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Users can only delete their own avatar
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
