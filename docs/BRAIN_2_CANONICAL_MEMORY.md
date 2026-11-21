# Jeeves Brain 2 — long-term knowledge and recall

## Purpose and boundary

Brain 2 is the persistent knowledge, research-source connection, relationship-mapping and recall layer for Jeeves.

Brain 2 is **not** a conversational assistant, reasoning engine, adviser or coach. It does not own:
- Gemini conversation generation or response writing
- Mind, Body or Soul council roles
- advice, recommendations, coaching or decision-making
- voice conversation, speech generation or conversational history
- task execution or health interpretation

Those capabilities remain with Brain 1 and the relevant Jeeves services. Brain 2 supplies trusted, permission-scoped knowledge when Brain 1 or another approved feature requests it. Brain 2 returns records, source references, relationships and retrieval metadata; the caller decides how to interpret or communicate them.

## Core responsibilities

1. **Long-term memory** — preserve durable facts, preferences, events, goals, people, habits, tasks and reflections in the existing canonical `public.memories` table.
2. **Research and source connections** — retain provenance and relationships between knowledge items and their source material. External provider connections are not enabled by this branch; they must be added as separately permissioned connectors.
3. **Knowledge relationships** — connect related memories and research records without duplicating their content.
4. **Recall** — provide authenticated, owner-scoped keyword retrieval, filtering and ranked results.
5. **Knowledge maintenance** — support review, editing, pinning, archiving, restoring, conflict resolution and deletion under explicit user control.
6. **Privacy and provenance** — keep ownership, sensitivity and source information attached to stored knowledge; treat retrieved content as untrusted reference data, never instructions.

## Current architecture

- `public.memories`: canonical long-term knowledge records.
- `public.memory_links`: owner-scoped relationships between records.
- `search_memories(text, limit)`: authenticated, owner-scoped full-text recall, weighted by importance and recency; sensitive and archived records are excluded.
- `jeeves-brain2`: authenticated knowledge-management API. It does not call Gemini and does not generate advice or conversation responses.
- `lists.js`: existing Memory UI, which manages records through the Brain 2 API.
- `jarvis-brain`: remains Brain 1's conversation/reasoning engine and is not replaced or deleted by this work.

The temporary duplicated Brain 1 conversation function has been removed from Brain 2. No Mind/Body/Soul prompts or reasoning/advice logic belong in Brain 2.

## Supported Brain 2 API actions

| Action | Knowledge responsibility |
| --- | --- |
| `list` | List the user's knowledge records |
| `search` | Recall matching active, non-sensitive knowledge |
| `remember` | Store a knowledge record |
| `update` | Correct content, type, importance or sensitivity |
| `pin` | Mark important knowledge for retention |
| `archive` / `restore` | Retire or reinstate a record without destroying it |
| `delete` | Delete a record only after explicit confirmation |
| `resolve` | Resolve two conflicting records |
| `link` / `links` / `unlink` | Map relationships between knowledge records |

## Research connections — intended design

Brain 2 should be able to associate knowledge with its origin: user notes, uploaded documents, project files and approved external research sources. A future source-connector layer should record, at minimum:
- source type and provider
- source title and stable external identifier or URL
- owner and granted permission/scope
- last successful sync and sync status
- source-to-memory relationships and retrieval provenance

Connectors must be opt-in, read only by default, owner-scoped and revocable. A connector must not silently ingest private data or send sensitive memories to an external model. No external research connector or background sync is activated by this development branch.

## Privacy and security rules

- Every request validates the caller with `auth.getUser()`.
- All reads and writes are scoped to the authenticated owner; RLS remains mandatory.
- New memories are sensitive by default. Automatically captured candidates remain sensitive until reviewed.
- Sensitive records are excluded from ordinary recall.
- The user must explicitly confirm before changing a sensitive record to non-sensitive.
- Credential-like strings are not valid durable memory.
- Retrieved content is escaped and treated as untrusted reference data, never executable instructions.
- Never log memory content, health details, personal source contents or access tokens.
- No service-role key is used by the user-facing Brain 2 API.

## Current limitations

- Search is PostgreSQL full-text search; vector/hybrid retrieval is not enabled.
- Deduplication currently catches exact normalized duplicates only.
- Memory links are manual; automatic relationship and conflict detection are not enabled.
- External provider connectors, source sync, source provenance records and document ingestion are not enabled yet.
- Last-access tracking and token-budgeted recall packaging are not implemented.
- The migration and function are not deployed. The frontend is not switched to Brain 2 for chat, and no live connection is made by this PR.

## Safe transition rule

Keep Brain 1 intact. Brain 2 must first be independently validated as a knowledge service: owner isolation, memory CRUD, search/recall, relationships, source provenance, connector permissions and revocation. Only after Brain 2 is connected and verified should any old duplicate knowledge functionality be considered for retirement. Brain 1's reasoning, council, voice and advice capabilities are not candidates for deletion from Brain 1.

No deployment, migration, merge, live database write, billing change or production switch is performed by this branch.
