-- Optional Discord Account Linking (Minimal Data) for HabiTick
-- Run this in your Supabase SQL Editor (SQL Editor -> New Query -> Run)

-- 1. Store only the minimal Discord identity fields needed to assign roles and display the linked handle
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discord_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS discord_username TEXT;

-- 2. Enforce 1-to-1 mapping so one Discord account cannot be linked to multiple HabiTick accounts
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_discord_id_unique
  ON profiles(discord_id)
  WHERE discord_id IS NOT NULL;

-- 3. Security Hardening: Only verified server endpoints (service_role) may write Discord fields
DO $$ BEGIN
  REVOKE UPDATE (discord_id, discord_username) ON profiles FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_client_discord_column_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND (NEW.discord_id IS NOT NULL OR NEW.discord_username IS NOT NULL) THEN
      RAISE EXCEPTION 'Discord fields cannot be set directly by client';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.discord_id IS DISTINCT FROM OLD.discord_id OR
      NEW.discord_username IS DISTINCT FROM OLD.discord_username
    ) THEN
      RAISE EXCEPTION 'Discord fields can only be modified via server OAuth verification';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_discord_columns ON profiles;
CREATE TRIGGER trg_protect_discord_columns
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_discord_column_update();

