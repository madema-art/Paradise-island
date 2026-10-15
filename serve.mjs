// Paradise Island's local server: node serve.mjs [port]
//  - serves the project as static files (no-store, so a rebuild is seen on reload)
//  - Island Notes API under /api/notes, for this machine only (localhost clients, localhost Host header)
//    the notes live in notes/island-notes.json (human-readable JSON), with timestamped backups in notes/backups/
//    and a readable summary in notes/ISLAND_NOTES.md that Claude Code reads at the start of a session.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 5173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.opus': 'audio/ogg', '.md': 'text/markdown; charset=utf-8' };
const MUSIC_EXTS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus']);

/* ---------------------------------------------------------------- Island Notes store */
const NOTES_DIR = path.join(root, 'notes');
const NOTES_FILE = path.join(NOTES_DIR, 'island-notes.json');
const BACKUP_DIR = path.join(NOTES_DIR, 'backups');
const SUMMARY_FILE = path.join(NOTES_DIR, 'ISLAND_NOTES.md');
const SCHEMA = 'paradise-island.island-notes/2';
// A note is just text and what it is about. It is either open (to be implemented) or done. There is nothing in between.
const STATUSES = ['open', 'done'];
const SCOPES = ['creature', 'species', 'object', 'class', 'location'];
// three statuses: 'open' (waiting for the owner's approval, not implemented), 'ready' (Ready for Claude: approved, to be implemented)
// and 'done'. The old six-status system's 'completed' is 'done'; everything else it had is 'open'.
const normStatus = (s) => (s === 'done' || s === 'completed' ? 'done' : s === 'ready' ? 'ready' : 'open');
const MAX_BODY = 256 * 1024;

const LOCAL_ADDR = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const nowIso = () => new Date().toISOString();
const emptyDoc = () => ({ schema: SCHEMA, revision: 0, updated: nowIso(), notes: [] });

function readDoc() {
  if (!fs.existsSync(NOTES_FILE)) return emptyDoc();
  const doc = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));     // throws on a damaged file: the file is then left untouched
  if (!doc || !Array.isArray(doc.notes)) throw new Error('island-notes.json has no notes array');
  return migrate(doc);
}

/** bring a store written by the old six-status system up to the two-status one (done in memory; saved on the next write) */
function migrate(doc) {
  if (doc.schema === SCHEMA) return doc;
  for (const n of doc.notes) {
    n.status = normStatus(n.status);
    delete n.type; delete n.priority;
    if (Array.isArray(n.history)) n.history = n.history.map((h) => ({ ...h, from: normStatus(h.from), to: normStatus(h.to) })).filter((h) => h.from !== h.to);
  }
  doc.schema = SCHEMA;
  return doc;
}

function summaryMarkdown(doc) {
  const ready = doc.notes.filter((n) => n.status === 'ready');
  const open = doc.notes.filter((n) => n.status === 'open');
  const done = doc.notes.filter((n) => n.status === 'done');
  const lines = [
    '# Island Notes — Paradise Island development notebook',
    '',
    'This file is generated from `notes/island-notes.json` every time the notebook is saved. Edit notes in the game (Notebook tab), not here.',
    '',
    `Revision ${doc.revision} · updated ${doc.updated} · ${ready.length} ready for Claude, ${open.length} open (waiting for approval), ${done.length} done.`,
    '',
    '**Only notes marked Ready for Claude are implemented automatically.** An open note is waiting for the owner\'s approval: do not implement it, and do not change its status. Claude implements a ready note, checks it in the game, then marks it done. If a ready note cannot be finished, leave it ready and write why in its blocker.',
    '',
  ];
  const entry = (n) => {
    const subj = n.subject || {};
    lines.push(`- **${subj.label || subj.id}** — scope ${subj.kind} \`${subj.id}\``);
    lines.push(`  - ${n.text.replace(/\n/g, '\n    ')}`);
    if (n.blocker) lines.push(`  - Blocker: ${n.blocker}`);
    if (n.resolution) lines.push(`  - Resolution: ${n.resolution}`);
    lines.push(`  - id \`${n.id}\`, created ${n.created}, updated ${n.updated}`);
  };
  for (const [title, group] of [['Ready for Claude', ready], ['Open (waiting for approval)', open], ['Done', done]]) {
    if (!group.length) continue;
    lines.push(`## ${title} (${group.length})`, '');
    for (const n of group.sort((a, b) => a.created.localeCompare(b.created))) entry(n);
    lines.push('');
  }
  return lines.join('\n');
}

function writeDoc(doc, prevRevision, fileExisted) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (fileExisted) {
    const stamp = nowIso().replace(/[:.]/g, '-');
    fs.copyFileSync(NOTES_FILE, path.join(BACKUP_DIR, `island-notes.r${prevRevision}.${stamp}.json`));
    const backups = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 200))) fs.unlinkSync(path.join(BACKUP_DIR, old));
  }
  const tmp = NOTES_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, NOTES_FILE);                       // atomic replace: the file is never half-written
  fs.writeFileSync(SUMMARY_FILE + '.tmp', summaryMarkdown(doc));
  fs.renameSync(SUMMARY_FILE + '.tmp', SUMMARY_FILE);
}

const clean = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
function sanitizeSubject(s) {
  if (!s || typeof s !== 'object') throw new Error('subject is required');
  if (!SCOPES.includes(s.kind)) throw new Error('subject.kind must be one of ' + SCOPES.join(', '));
  const id = clean(s.id, 240);
  if (!id) throw new Error('subject.id is required');
  const out = { kind: s.kind, id, label: clean(s.label, 160) || id, category: clean(s.category, 60) };
  if (Array.isArray(s.pos) && s.pos.length === 3 && s.pos.every((v) => Number.isFinite(v))) out.pos = s.pos.map((v) => Math.round(v * 100) / 100);
  if (Number.isFinite(s.radius)) out.radius = Math.max(0, Math.min(500, s.radius));
  if (s.speciesId) out.speciesId = clean(s.speciesId, 160);
  if (s.classId) out.classId = clean(s.classId, 120);
  return out;
}
function sanitizeNote(n) {
  const text = typeof n.text === 'string' ? n.text.trim() : '';
  if (!text) throw new Error('text is required');
  if (text.length > 4000) throw new Error('text is longer than 4000 characters');
  const at = nowIso();
  return {
    id: 'n' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'),
    subject: sanitizeSubject(n.subject),
    status: n.status === undefined ? 'open' : normStatus(n.status),
    text,
    blocker: clean(n.blocker, 1000),
    resolution: clean(n.resolution, 1000),
    created: at, updated: at,
    history: [],
  };
}

/** apply one operation to the store; every write is checked against the note's last-known timestamp */
function applyOp(op) {
  const existed = fs.existsSync(NOTES_FILE);
  const doc = readDoc();
  const prevRevision = doc.revision;
  if (op.type === 'add') {
    const note = sanitizeNote(op.note || {});
    doc.notes.push(note);
    doc.revision = prevRevision + 1; doc.updated = nowIso();
    writeDoc(doc, prevRevision, existed);
    return { status: 200, body: { ok: true, doc, note } };
  }
  const idx = doc.notes.findIndex((n) => n.id === op.id);
  if (idx < 0) return { status: 404, body: { ok: false, error: 'not-found', message: 'That note no longer exists.', doc } };
  const current = doc.notes[idx];
  if (op.expectedUpdated && op.expectedUpdated !== current.updated) {
    return { status: 409, body: { ok: false, error: 'conflict', message: 'This note was changed elsewhere (in another window or by Claude Code). Reload the notebook and try again.', note: current, doc } };
  }
  if (op.type === 'delete') {
    doc.notes.splice(idx, 1);
  } else if (op.type === 'update') {
    const p = op.patch || {};
    const at = nowIso();
    if (p.text !== undefined) {
      const t = String(p.text).trim();
      if (!t) throw new Error('text cannot be empty');
      if (t.length > 4000) throw new Error('text is longer than 4000 characters');
      current.text = t;
    }
    if (p.blocker !== undefined) current.blocker = clean(p.blocker, 1000);
    if (p.resolution !== undefined) current.resolution = clean(p.resolution, 1000);
    const next = p.status === undefined ? current.status : normStatus(p.status);
    if (next !== current.status) {
      current.history = [...(current.history || []), { at, from: current.status, to: next }].slice(-30);
      current.status = next;
    }
    current.updated = at;
  } else {
    throw new Error('unknown op ' + op.type);
  }
  doc.revision = prevRevision + 1; doc.updated = nowIso();
  writeDoc(doc, prevRevision, existed);
  return { status: 200, body: { ok: true, doc, note: op.type === 'update' ? current : null } };
}

/* ---------------------------------------------------------------- HTTP */
function localOnly(req) {
  const addr = req.socket.remoteAddress || '';
  const host = req.headers.host || '';
  const origin = req.headers.origin;
  if (!LOCAL_ADDR.has(addr) || !LOCAL_HOST.test(host)) return false;
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) return false;
  return true;
}
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

http
  .createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    if (url.startsWith('/api/')) {
      if (!localOnly(req)) { sendJson(res, 403, { ok: false, error: 'forbidden', message: 'The notebook API only accepts requests from this computer.' }); return; }
      try {
        if (url === '/api/notes' && req.method === 'GET') {
          const doc = readDoc();
          sendJson(res, 200, { ok: true, storePath: 'notes/island-notes.json', doc });
          return;
        }
        if (url === '/api/music/playlist' && req.method === 'GET') {
          const items = fs.readdirSync(path.join(root, 'music'))
            .filter((name) => MUSIC_EXTS.has(path.extname(name).toLowerCase()))
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .map((name) => ({ id: name, title: name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '), src: 'music/' + encodeURIComponent(name) }));
          sendJson(res, 200, { ok: true, items });
          return;
        }
        if (url === '/api/notes/op' && req.method === 'POST') {
          if (!/application\/json/.test(req.headers['content-type'] || '')) { sendJson(res, 415, { ok: false, error: 'content-type', message: 'Send JSON.' }); return; }
          const op = JSON.parse(await readBody(req));
          const r = applyOp(op);
          sendJson(res, r.status, r.body);
          return;
        }
        sendJson(res, 404, { ok: false, error: 'no-such-api' });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'bad-request', message: String(err.message || err) });
      }
      return;
    }
    let p = decodeURIComponent(url);
    if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(port, () => console.log(`Paradise Island at http://localhost:${port}  (notes: ${NOTES_FILE})`));
