-- Brain 2: extend the existing canonical memories table in place.
-- No rows are deleted or moved. Legacy memories are conservatively marked sensitive.
ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS memory_type text NOT NULL DEFAULT 'fact',
  ADD COLUMN IF NOT EXISTS importance smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitive boolean NOT NULL DEFAULT true;

-- Existing content has not been reclassified, so fail safe until reviewed.
UPDATE public.memories SET sensitive = true WHERE sensitive IS DISTINCT FROM true;

ALTER TABLE public.memories
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_memory_type_check
    CHECK (memory_type IN ('fact','preference','event','goal','person','habit','task','reflection')),
  ADD CONSTRAINT memories_importance_check
    CHECK (importance BETWEEN 1 AND 5),
  ADD CONSTRAINT memories_status_check
    CHECK (status IN ('active','archived','conflict')),
  ADD CONSTRAINT memories_source_check
    CHECK (source IN ('legacy','user','conversation','project','document','assistant')),
  ADD CONSTRAINT memories_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES public.memories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS memories_owner_status_created_idx
  ON public.memories (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_owner_type_idx
  ON public.memories (user_id, memory_type, status);
CREATE INDEX IF NOT EXISTS memories_owner_expiry_idx
  ON public.memories (user_id, expires_at)
  WHERE expires_at IS NOT NULL;

-- authenticated users need row-level CRUD only; never table-wide destructive privileges.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.memories FROM authenticated;

-- Explicit owner-scoped hybrid-ready keyword retrieval for Brain 1.
-- Keep the existing return shape so current callers remain compatible.
CREATE OR REPLACE FUNCTION public.search_memories(
  search_text text,
  max_results integer DEFAULT 10
)
RETURNS TABLE(content text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH query AS (
    SELECT pg_catalog.websearch_to_tsquery(
      'english'::pg_catalog.regconfig,
      coalesce(search_text, '')
    ) AS terms
  )
  SELECT m.content, m.created_at
  FROM public.memories AS m
  CROSS JOIN query AS q
  WHERE m.user_id = (SELECT auth.uid())
    AND m.status = 'active'
    AND q.terms @@ pg_catalog.to_tsvector('english'::pg_catalog.regconfig, m.content)
  ORDER BY
    pg_catalog.ts_rank_cd(
      pg_catalog.to_tsvector('english'::pg_catalog.regconfig, m.content),
      q.terms
    ) * m.importance DESC,
    m.created_at DESC
  LIMIT greatest(1, least(coalesce(max_results, 10), 20));
$function$;

-- Composite ownership references require a matching unique key.
CREATE UNIQUE INDEX IF NOT EXISTS memories_id_user_id_uidx
  ON public.memories (id, user_id);

-- Explicit relationships between canonical memories; no duplicate content store.
CREATE TABLE IF NOT EXISTS public.memory_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  from_memory_id uuid NOT NULL,
  to_memory_id uuid NOT NULL,
  relation text NOT NULL CHECK (char_length(relation) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_links_not_self CHECK (from_memory_id <> to_memory_id),
  CONSTRAINT memory_links_from_owner_fk
    FOREIGN KEY (from_memory_id, user_id)
    REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT memory_links_to_owner_fk
    FOREIGN KEY (to_memory_id, user_id)
    REFERENCES public.memories(id, user_id) ON DELETE CASCADE,
  CONSTRAINT memory_links_unique UNIQUE (user_id, from_memory_id, to_memory_id, relation)
);

CREATE INDEX IF NOT EXISTS memory_links_owner_created_idx
  ON public.memory_links (user_id, created_at DESC);

ALTER TABLE public.memory_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own memory links" ON public.memory_links;
CREATE POLICY "users read own memory links" ON public.memory_links
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "users insert own memory links" ON public.memory_links;
CREATE POLICY "users insert own memory links" ON public.memory_links
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "users delete own memory links" ON public.memory_links;
CREATE POLICY "users delete own memory links" ON public.memory_links
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

GRANT SELECT, INSERT, DELETE ON public.memory_links TO authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.memory_links FROM authenticated;
