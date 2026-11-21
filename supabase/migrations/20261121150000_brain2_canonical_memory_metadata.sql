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
