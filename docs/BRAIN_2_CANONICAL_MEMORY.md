# Jeeves Brain 2 — canonical memory engine

## Architecture

Brain 1 remains the reasoning and response engine. Brain 2 is the long-term knowledge layer. Both use the existing `public.memories` table; Brain 2 does not create a second content store.

- `public.memories`: canonical facts, preferences, events, goals, people, habits, tasks and reflections.
- `public.memory_links`: owner-scoped relationships between memory records.
- `search_memories(text, limit)`: authenticated, owner-scoped full-text retrieval, ranked by importance and recency.
- `jeeves-brain2`: authenticated Edge Function for listing, search, remembering, editing, pinning, archiving, deleting, resolving and linking memories.
- `lists.js`: Memory UI in the existing navigation.

## Privacy rules

- Every request validates the caller with `auth.getUser()`.
- Queries additionally scope to the authenticated owner; RLS remains required.
- New memories are marked sensitive by default.
- Automatically captured memories remain sensitive until the user reviews them in the Memory UI.
- The Brain 1 retrieval function excludes sensitive memories, so they are not placed in Gemini context.
- The user must explicitly confirm before changing a sensitive memory to non-sensitive.
- Credentials and credential-like strings are rejected from durable capture.
- Memory text is escaped before prompt insertion and framed as untrusted reference data.
- Memory content, health details and tokens must never be written to logs.

## Supported service actions

| Action | Purpose |
| --- | --- |
| `list` | List the user's memory metadata and content |
| `search` | Search active, non-sensitive memories |
| `remember` | Save a classified memory |
| `update` | Edit content, type, importance or sensitivity |
| `pin` | Pin or unpin |
| `archive` | Archive without deleting |
| `delete` | Delete one record after explicit confirmation |
| `resolve` | Keep one memory active and mark another superseded |
| `link` / `links` / `unlink` | Manage owner-scoped memory relationships |

## Current limitations / next engineering steps

- Deduplication currently catches exact normalized duplicates only. Semantic deduplication needs a verified embedding model, dimensions, free-tier limits and a privacy decision.
- Search is PostgreSQL full-text search weighted by importance and creation time. Vector/hybrid retrieval is not enabled.
- Automatic capture is conservative and stores candidates as sensitive until human review.
- Memory links are manual; automatic entity and relationship extraction is not yet enabled.
- A conflict can be resolved in the service, but automatic conflict detection is not yet enabled.
- Last-access timestamps, token-budgeted recall explanations and weekly maintenance are not yet implemented.
- The migration must be applied before the new UI/function can operate. The Edge Function must be deployed after the migration. Neither has been performed by this PR.

## Safe rollout checklist

1. Review the migration against the live schema and confirm every existing row has an owner.
2. Apply the migration in a controlled maintenance window; verify row counts before and after.
3. Deploy `jeeves-brain2` with JWT verification enabled.
4. Deploy the updated `jarvis-brain` only after checking the deployed source and secrets.
5. Test with the authenticated owner: list, search, remember, edit, pin, archive, link, unlink, resolve and delete.
6. Test a second account and verify that it cannot read, mutate, link or search the first account's memories.
7. Confirm sensitive records never appear in Gemini request context or logs.
8. Only then enable automatic capture for normal use.

No billing, paid APIs or external embedding service is required for this initial release.


## Brain 1 capability duplication (staged, not connected)

To avoid losing existing capabilities during the transition, Brain 1's complete conversation Edge Function has been copied into `supabase/functions/jeeves-brain2-chat/index.ts`. The original `supabase/functions/jarvis-brain/index.ts` remains unchanged.

The duplicate carries forward the existing Gemini request/response flow, Mind/Body/Soul council prompts, conversation history handling, image input, memory retrieval and automatic candidate capture, task creation, health-record context, user-approved feedback/preferences, and response-speaker selection. It continues to use the existing authenticated user-scoped Supabase client and existing tables/RPCs; no new live connection or data copy has been made.

The Brain 2 memory-management API remains in `supabase/functions/jeeves-brain2/index.ts`. These two Brain 2 functions are staged as separate responsibilities: conversation/council processing and canonical memory management. The frontend still calls Brain 1 for chat and the existing Brain 2 API only where its current code directs it. No deployment, migration, merge, live database write, or production switch is performed by this duplication.

**Transition rule:** keep Brain 1 intact until Brain 2 is deployed with approval, connected, and verified end-to-end (chat, council, retrieval, capture, tasks, health context, feedback, voice playback, and error handling). Only then consider removing duplicated Brain 1 code.
