// Island Notes, client side. The notes live in notes/island-notes.json in the project, kept by the local server
// (serve.mjs). Every change is sent to the server as one operation, checked against the note's last-known timestamp,
// so two windows or Claude Code can never silently overwrite each other. While the server is unreachable the notebook
// is read-only: nothing is kept only in the browser.
export const NOTE_STATUS = [
  { id: 'open', label: 'Open', hint: 'Waiting for approval. Claude does not implement it until it is marked Ready for Claude.' },
  { id: 'ready', label: 'Ready for Claude', hint: 'Approved. Claude implements it, checks it in the game, then marks it done.' },
  { id: 'done', label: 'Done', hint: 'Implemented and checked in the game.' },
];

let doc = { revision: 0, notes: [] };
let storePath = 'notes/island-notes.json';
let online = false;
let loadedOnce = false;
let lastError = '';
const listeners = new Set();

export const onNotesChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.warn('notes listener failed', e); } } };

export const notesState = () => ({ online, loaded: loadedOnce, error: lastError, storePath, revision: doc.revision });
export const allNotes = () => doc.notes;

async function fetchJson(url, init) {
  const r = await fetch(url, { cache: 'no-store', ...init });
  let j = null;
  try { j = await r.json(); } catch (e) { throw new Error('The notes server returned something unexpected (HTTP ' + r.status + ').'); }
  return { status: r.status, body: j };
}

/** read the store from the server; retries quietly while the server is away */
export async function loadNotes() {
  try {
    const { body } = await fetchJson('/api/notes');
    if (!body.ok) throw new Error(body.message || 'The notes file could not be read.');
    doc = body.doc; storePath = body.storePath || storePath; online = true; loadedOnce = true; lastError = '';
    emit();
    startPolling();
  } catch (err) {
    online = false; lastError = err.message || String(err);
    emit();
    setTimeout(loadNotes, 4000);
  }
}

// changes made elsewhere (another window, or Claude Code editing the file) appear without a reload
let polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  setInterval(async () => {
    if (!online) return;
    try {
      const { body } = await fetchJson('/api/notes');
      if (body.ok && body.doc.revision !== doc.revision) { doc = body.doc; emit(); }
    } catch (e) { /* the next poll will try again */ }
  }, 4000);
}

/** apply one change on the server. Resolves with the note (for add/update), or rejects with a readable message. */
async function send(op) {
  if (!online) throw new Error('The notes server is not reachable, so notes cannot be changed right now. Start the game with the local server (node serve.mjs) and try again.');
  let res;
  try {
    res = await fetchJson('/api/notes/op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
  } catch (err) {
    online = false; lastError = 'The notes server stopped responding.'; emit(); setTimeout(loadNotes, 4000);
    throw new Error(lastError);
  }
  if (res.body && res.body.doc) { doc = res.body.doc; emit(); }
  if (res.status === 409) {
    const e = new Error(res.body.message || 'This note changed elsewhere. The notebook has been refreshed.'); e.conflict = true; throw e;
  }
  if (!res.body || !res.body.ok) throw new Error((res.body && res.body.message) || 'The note could not be saved.');
  return res.body.note;
}

export const addNote = (fields) => send({ type: 'add', note: fields });
export const updateNote = (note, patch) => send({ type: 'update', id: note.id, expectedUpdated: note.updated, patch });
export const deleteNote = (note) => send({ type: 'delete', id: note.id, expectedUpdated: note.updated });

/** a note applies to a subject when its scope matches: this object, its class, a location around it, its species or creature */
export function notesFor(subject) {
  if (!subject) return [];
  return doc.notes.filter((n) => {
    const s = n.subject;
    if (s.kind === 'object') return s.id === subject.id;
    if (s.kind === 'class') return !!subject.classId && s.id === subject.classId;
    if (s.kind === 'species') return !!subject.speciesId && s.id === 'species:' + subject.speciesId;
    if (s.kind === 'creature') return !!subject.creatureId && s.id === 'creature:' + subject.creatureId;
    if (s.kind === 'location') {
      if (!subject.pos || !s.pos) return false;
      const dx = subject.pos[0] - s.pos[0], dz = subject.pos[2] - s.pos[2];
      return Math.hypot(dx, dz) <= (s.radius || 10);
    }
    return false;
  });
}

export const statusInfo = (id) => NOTE_STATUS.find((s) => s.id === id) || NOTE_STATUS[0];
export const isDone = (n) => n.status === 'done';
