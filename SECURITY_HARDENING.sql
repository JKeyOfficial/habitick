-- ==============================================================================
-- SECURITY HARDENING MIGRATION
-- Prevents client-side privilege escalation and protects billing/admin columns
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

