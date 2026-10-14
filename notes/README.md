# Island Notes

The development notebook for Paradise Island. Notes are written in the game (the **Notebook** tab, the **Inspect** tab
and the note boxes in the **Field guide**), and stored here so Claude Code can read them in every development session.

A note is just text and what it is about. It has one of three statuses:

- **open**: waiting for the owner's approval. Claude does not implement it, and does not change its status.
- **ready** (shown as *Ready for Claude*): approved. Claude implements it, checks it in the game, then marks it done.
- **done**: implemented and checked in the game.

Only ready notes are implemented automatically. There are no types, priorities or ideas.

## Files

- `island-notes.json` — the store. Human-readable JSON, the single source of truth. Written only by the local server.
- `ISLAND_NOTES.md` — a readable summary, regenerated on every save. Read this first.
- `backups/` — a copy of the store before each change (`island-notes.r<revision>.<timestamp>.json`, newest 200 kept).
- `README.md` — this file.

Do not edit the JSON while the game is open unless you use the API below; the game re-reads the store on each change and
refuses an update whose timestamp no longer matches (so nothing is silently overwritten).

## Note format

```json
{
  "id": "n...",
  "subject": { "kind": "object", "id": "obj:palm:12.3,-45.6", "label": "Coconut palm", "category": "Trees", "pos": [12.3, 4.1, -45.6] },
  "status": "open",
  "text": "What is wrong or wanted, in the player's words.",
  "blocker": "",
  "resolution": "",
  "created": "2026-10-13T09:40:00.000Z",
  "updated": "2026-10-13T09:40:00.000Z",
  "history": []
}
```

- **subject.kind**: `object` (one specific object: a tree, rock, structure, water feature), `class` (every object of one
  kind, e.g. `class:palm`), `location` (a place: `pos` and `radius` in metres), `species` (`species:<name>`), `creature`
  (one individual: `creature:<id>`).
- **status**: `open`, `ready` or `done`. Claude sets `done` only after the change is implemented and verified, and writes what was done in `resolution`.
  If a ready note cannot be finished, leave it `ready` and say why in `blocker`. Never move a note from `open` to `ready` yourself: that is the owner's approval.

Stores written by the old system (six statuses plus type and priority) are migrated automatically on the next read: `completed` becomes
`done`, everything else becomes `open` (waiting for approval), and type and priority are dropped.

Object ids are stable: they come from the seeded world generator (the same object has the same id after every reload).
Creature ids come from the registry (for example `gull3`, `north-ocean-pod-dolphin0`).

## API (local server only)

The server accepts these only from this computer (127.0.0.1 / localhost). Start the game first (`node serve.mjs` or the
`Open Paradise Island` launcher).

- `GET  /api/notes` — the whole store.
- `POST /api/notes/op` with JSON:
  - add: `{"type":"add","note":{"subject":{...},"text":"..."}}`
  - update: `{"type":"update","id":"n...","expectedUpdated":"<the note's updated value>","patch":{"status":"done","resolution":"..."}}`
  - delete: `{"type":"delete","id":"n...","expectedUpdated":"<updated>"}`

Example, marking a note done:

```bash
curl -s -X POST http://localhost:5173/api/notes/op -H "Content-Type: application/json" \
  -d '{"type":"update","id":"n...","expectedUpdated":"...","patch":{"status":"done","resolution":"Fixed in ..."}}'
```

A `409` response means the note changed since you read it: read the store again and decide.
