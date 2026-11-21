-- Brain 2 hardening: make sensitive-data review and conflict resolution atomic.
-- SECURITY INVOKER keeps caller permissions and RLS in force.

CREATE OR REPLACE FUNCTION public.set_memory_sensitivity(
  p_memory_id uuid,
  p_sensitive boolean,
  p_confirm_review boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  changed integer;
BEGIN
  IF p_sensitive IS NULL THEN
    RAISE EXCEPTION 'Sensitivity value is required';
  END IF;
  IF p_sensitive = false AND coalesce(p_confirm_review, false) = false THEN
    RAISE EXCEPTION 'Explicit review confirmation is required';
  END IF;

  UPDATE public.memories
  SET sensitive = p_sensitive
  WHERE id = p_memory_id
    AND user_id = (SELECT auth.uid());

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_memory_sensitivity(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_memory_sensitivity(uuid, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_memory_conflict(
  p_chosen_memory_id uuid,
  p_superseded_memory_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  chosen_count integer;
  old_count integer;
BEGIN
  IF p_chosen_memory_id IS NULL OR p_superseded_memory_id IS NULL
     OR p_chosen_memory_id = p_superseded_memory_id THEN
    RAISE EXCEPTION 'Two different memory IDs are required';
  END IF;

  -- Both updates execute in one transaction. Any failure rolls both back.
  UPDATE public.memories
  SET status = 'active', superseded_by = NULL
  WHERE id = p_chosen_memory_id
    AND user_id = (SELECT auth.uid());

  GET DIAGNOSTICS chosen_count = ROW_COUNT;
  IF chosen_count <> 1 THEN
    RAISE EXCEPTION 'Chosen memory not found';
  END IF;

  UPDATE public.memories
  SET status = 'archived', superseded_by = p_chosen_memory_id
  WHERE id = p_superseded_memory_id
    AND user_id = (SELECT auth.uid());

  GET DIAGNOSTICS old_count = ROW_COUNT;
  IF old_count <> 1 THEN
    RAISE EXCEPTION 'Superseded memory not found';
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_memory_conflict(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_memory_conflict(uuid, uuid) TO authenticated;
