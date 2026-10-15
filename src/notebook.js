// Island Notes UI: the inspection panel (click anything in the world), development-note boxes for the Field Guide and the
// inspection panel, and the central Notebook tab that lists every note across the island.
import * as THREE from 'three';
import { creatures } from './core.js';
import { cam, followCreature, flyTo } from './camera.js';
import { findRecord, firstRecordOf, resultFor, factsFor, inspectAt } from './inspect.js';
import { CATALOG } from './catalog.js';
import { SpecimenViewer } from './specimen.js';
import * as S from './notes.js';
import { isTyping } from './typing.js';
import * as menu from './menu.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (iso) => { try { return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; } };
const GROUPS = [['creature', 'Creatures and species'], ['object', 'Objects'], ['class', 'Kinds of object'], ['location', 'Places']];
const groupOf = (note) => (note.subject.kind === 'species' ? 'creature' : note.subject.kind);
const STATUS_TAG = { ready: 'st-ready', done: 'st-done' };
const byAge = (a, b) => (S.isDone(a) - S.isDone(b)) || a.created.localeCompare(b.created);       // open notes first, oldest first

/* ------------------------------------------------------------------------- shared note UI */
const boxes = new Set();          // mounted note boxes that re-render when the store changes
const openEditors = new Map();    // note id -> draft text, so an editor survives a re-render

function noteCard(n, { showSubject = false } = {}) {
  const st = S.statusInfo(n.status);
  const editing = openEditors.has(n.id);
  const dis = S.notesState().online ? '' : ' disabled';
  const scope = { creature: 'creature', species: 'species', object: 'object', class: 'kind', location: 'place' }[n.subject.kind] || n.subject.kind;
  return `<div class="dn-card" data-id="${esc(n.id)}">
    <div class="dn-top">
      <span class="dn-st ${STATUS_TAG[n.status] || ''}" title="${esc(st.hint)}">${st.label}</span>
      <span class="dn-pill dim">${scope}</span>
    </div>
    ${showSubject ? `<div class="dn-subj">${esc(n.subject.label)}<small>${esc(n.subject.category || '')}</small></div>` : ''}
    ${editing
      ? `<textarea class="dn-edit" rows="3">${esc(openEditors.get(n.id))}</textarea>
         <div class="dn-acts"><button data-act="save" class="on"${dis}>Save</button><button data-act="cancel">Cancel</button></div>`
      : `<div class="dn-text">${esc(n.text).replace(/\n/g, '<br>')}</div>`}
    ${n.blocker ? `<div class="dn-note-line"><b>Blocked by:</b> ${esc(n.blocker)}</div>` : ''}
    ${n.resolution ? `<div class="dn-note-line"><b>Resolved:</b> ${esc(n.resolution)}</div>` : ''}
    <div class="dn-meta">${when(n.created)}${n.updated !== n.created ? ' · edited ' + when(n.updated) : ''}</div>
    <div class="dn-acts">
      ${S.isDone(n) ? '' : `<button data-act="approve"${dis}>${n.status === 'ready' ? 'Withdraw approval' : 'Ready for Claude'}</button>`}
      <button data-act="toggle"${dis}>${S.isDone(n) ? 'Reopen' : 'Mark done'}</button>
      ${editing ? '' : `<button data-act="edit"${dis}>Edit</button>`}
      <button data-act="delete" class="danger"${dis}>Delete</button>
      ${showSubject ? '<button data-act="show" class="on">Show</button>' : ''}
    </div>
  </div>`;
}

function noteForm(scopes, box) {
  const off = !S.notesState().online;
  const f = box.fields;
  return `<form class="dn-form" ${off ? 'data-off' : ''}>
    <textarea name="text" rows="3" placeholder="What did you notice? What should change?" ${off ? 'disabled' : ''}>${esc(box.draft || '')}</textarea>
    ${scopes.length > 1 ? `<div class="dn-row"><label class="dn-lbl">Applies to</label><select name="scope" class="dn-sel dn-wide">${scopes.map((s, i) => `<option value="${i}"${i === f.scope ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>` : ''}
    <div class="dn-row"><button type="submit" class="on" ${off ? 'disabled' : ''}>Add note</button><span class="dn-hint">${off ? 'Read-only: open the game with Open Paradise Island.bat, which starts the notes server.' : 'Every note is a request: Claude implements it.'}</span></div>
  </form>`;
}

/** a development-notes box for one subject (a creature, species, object, kind or place) */
function mountBox(host, { match, scopes, heading }) {
  const box = { host, match, scopes, heading, draft: '', msg: '', fields: { scope: 0 } };
  boxes.add(box);
  render(box);
  return box;
}
function render(box) {
  if (!box.host.isConnected) { boxes.delete(box); return; }
  const notes = S.notesFor(box.match).sort(byAge);
  box.host.innerHTML = `<div class="dn-head"><h4>${esc(box.heading)}</h4><span class="dn-count">${notes.length}</span></div>
    <div class="dn-list">${notes.length ? notes.map((n) => noteCard(n)).join('') : '<p class="dn-empty">No notes here yet.</p>'}</div>
    ${noteForm(box.scopes, box)}
    <p class="dn-msg">${esc(box.msg)}</p>`;
  const form = box.host.querySelector('form.dn-form');
  if (form) {
    form.addEventListener('input', (e) => { if (e.target.name === 'text') box.draft = e.target.value; });
    form.addEventListener('change', (e) => { if (e.target.name in box.fields) box.fields[e.target.name] = Number(e.target.value); });
    form.addEventListener('submit', (e) => { e.preventDefault(); addFromForm(box, form); });
  }
  box.host.querySelectorAll('.dn-card').forEach((card) => wireCard(card, (msg) => { box.msg = msg; }));
}
function refreshBoxes() {
  for (const b of [...boxes]) render(b);
  if (notebookPane) renderNotebook();
}

async function addFromForm(box, form) {
  const text = form.elements.text.value.trim();
  if (!text) { box.msg = 'Write something first.'; render(box); return; }
  const scope = box.scopes[box.fields.scope] || box.scopes[0];
  try {
    await S.addNote({
      subject: scope.make(), text,
    });
    box.draft = ''; box.msg = 'Saved. The note is in the Notebook tab.';
  } catch (err) {
    box.msg = err.message;
  }
  render(box);
}

/** wires the buttons of a note card: done/reopen, edit, delete, show */
function wireCard(card, setMsg) {
  const id = card.dataset.id;
  const note = () => S.allNotes().find((n) => n.id === id);
  const run = async (fn) => {
    try { await fn(); setMsg(''); }
    catch (err) { setMsg(err.message); refreshBoxes(); }
  };
  card.addEventListener('change', (e) => {
    const act = e.target.dataset.act;
  });
  card.addEventListener('input', (e) => { if (e.target.classList.contains('dn-edit')) openEditors.set(id, e.target.value); });
  card.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'approve') run(() => S.updateNote(note(), { status: note().status === 'ready' ? 'open' : 'ready' }));
    if (act === 'toggle') run(() => S.updateNote(note(), { status: S.isDone(note()) ? 'open' : 'done' }));
    if (act === 'edit') { openEditors.set(id, note().text); refreshBoxes(); }
    if (act === 'cancel') { openEditors.delete(id); refreshBoxes(); }
    if (act === 'save') {
      const text = card.querySelector('.dn-edit').value;
      run(async () => { await S.updateNote(note(), { text }); openEditors.delete(id); });
    }
    if (act === 'delete') {
      if (btn.dataset.armed) run(() => S.deleteNote(note()));
      else { btn.dataset.armed = '1'; btn.textContent = 'Really delete?'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Delete'; }, 3000); }
    }
    if (act === 'show') showNote(note());
  });
}

/* ------------------------------------------------------------------------- the inspection panel */
let insViewer = null, insResult = null, insHostEl = null;
const inspBody = () => $('#insBody');
function ensureInspViewer() {
  if (!insViewer) insViewer = new SpecimenViewer($('#inspView'));
  return insViewer;
}
const viewerEntry = (res) => {
  const sim = { variant: res.key };
  if (res.instanced) {
    const im = res.owner;
    return { name: res.title, sim, specimen: () => { const g = new THREE.Group(); g.add(new THREE.Mesh(im.geometry, im.material)); return g; } };
  }
  return { name: res.title, sim, group: res.owner };
};

/** show an inspection result in the panel (opens the Inspect tab and shows the interface if it is hidden) */
export function openInspection(res) {
  insResult = res;
  menu.openMenu('journal');
  document.querySelector('#p-journal .subtabs button[data-t="inspect"]').click();
  const hint = $('#inspHint'), empty = $('#inspEmpty');
  if (res.model && res.owner) {
    const v = ensureInspViewer();
    v.show(viewerEntry(res));
    if (empty) empty.style.display = 'none';
    hint.textContent = 'Drag to rotate · wheel to zoom';
  } else {
    if (insViewer) insViewer.setVisible(false);
    if (empty) { empty.style.display = 'flex'; empty.textContent = res.kind === 'object' ? 'This feature has no separate model.' : 'Water and ground are shown as places, not models.'; }
    hint.textContent = res.kind === 'location' ? 'A place in the world. Notes can apply to this area.' : 'Click a tree, flower, rock, structure or creature to inspect it.';
  }
  const facts = factsFor(res);
  const st = res.status && res.status !== 'model' ? ({ real: 'Real organism', feature: 'Natural feature', game: 'Game feature', fictional: 'Fictional', 'game-model': 'Game model' })[res.status] || '' : (res.kind === 'object' ? 'Game model' : '');
  $('#inspView').classList.toggle('no-model', !(res.model && res.owner));
  const scopes = [];
  if (res.kind === 'object') {
    scopes.push({ label: `This ${res.title.toLowerCase()} only`, make: () => res.subject });
    if (res.classSubject) scopes.push({ label: `Every ${res.title.toLowerCase()} (${res.count})`, make: () => ({ ...res.classSubject }) });
  }
  scopes.push({ label: `This area (10 m around here)`, make: () => ({ kind: 'location', id: `loc:${Math.round(res.pos.x / 5) * 5},${Math.round(res.pos.z / 5) * 5}`, label: `Area around ${res.title}`, category: res.category, pos: [res.pos.x, res.pos.y, res.pos.z], radius: 10 }) });
  const body = inspBody();
  body.innerHTML = `<div class="spec-head">
      <div class="spec-name">${esc(res.title)}</div>
      <div class="spec-sci">${esc(res.category)}${res.instanced ? ' · one of ' + res.count : ''}</div>
      <div class="spec-tags">${st ? `<span class="tag${st.includes('model') || st.includes('feature') ? ' fict' : ''}">${esc(st)}</span>` : ''}</div>
    </div>
    <div class="spec-facts"><p class="note">${esc(res.desc || '')}</p>
      ${facts.map(([k, v]) => `<div class="row2"><label>${esc(k)}</label><span>${esc(v)}</span></div>`).join('')}
    </div>
    <div class="dev-notes" id="insNotes"></div>`;
  mountBox($('#insNotes'), {
    heading: 'Development notes',
    match: { id: res.id, classId: res.classSubject ? res.classSubject.id : null, pos: [res.pos.x, res.pos.y, res.pos.z] },
    scopes,
  });
  if (!res.model) {} // no viewer for places
}

/** the Go to button: fly the camera to what is being inspected */
function goTo(pos) {
  flyTo([pos.x - 16, pos.y + 9, pos.z - 16], [pos.x, pos.y + 0.5, pos.z], 1.6);
}

/** a note's Show button: follow a creature, go to a place, or inspect an object */
function showNote(n) {
  const s = n.subject;
  if (s.kind === 'creature') {
    const c = creatures.find((x) => 'creature:' + x.id === s.id);
    if (c) followCreature(c);
  } else if (s.kind === 'species') {
    const c = creatures.find((x) => x.name === s.speciesId);
    if (c) followCreature(c);
  } else if (s.kind === 'object') {
    const rec = findRecord(s.id);
    if (rec) { goTo(rec.pos); openInspection(resultFor(rec)); }
    else showGone('That object is no longer in the world.');
  } else if (s.kind === 'class') {
    const rec = firstRecordOf(s.id.slice(6));
    if (rec) { goTo(rec.pos); openInspection(resultFor(rec)); }
  } else if (s.kind === 'location' && s.pos) {
    flyTo([s.pos[0] - 16, s.pos[1] + 9, s.pos[2] - 16], [s.pos[0], s.pos[1] + 0.5, s.pos[2]], 1.6);
  }
}
let goneTimer = 0;
function showGone(msg) {
  const el = $('#nbFoot'); if (el) el.textContent = msg;
  clearTimeout(goneTimer); goneTimer = setTimeout(renderFooter, 4000);
}

/* ------------------------------------------------------------------------- the Field Guide notes */
/** keeps the Field Guide's note box on the species and the followed individual */
export function onFollowed(c) {
  const host = $('#specNotes');
  if (!host || !c) return;
  guideBox = mountBox(host, {
    heading: 'Development notes: ' + c.name,
    match: { creatureId: c.id, speciesId: c.name },
    scopes: [
      { label: `${c.name} (this individual)`, make: () => ({ kind: 'creature', id: 'creature:' + c.id, label: `${c.name} (${c.id})`, category: c.cat || 'Creatures', speciesId: c.name }) },
      { label: `All ${c.name}`, make: () => ({ kind: 'species', id: 'species:' + c.name, label: c.name, category: c.cat || 'Creatures', speciesId: c.name }) },
    ],
  });
}
let guideBox = null;

/* ------------------------------------------------------------------------- the Notebook tab */
let notebookPane = null;
let nbFilter = 'open', nbQuery = '';
function renderFilters() {
  const all = S.allNotes();
  const count = (id) => (id === 'all' ? all.length : all.filter((n) => n.status === id).length);
  $('#nbFilters').innerHTML = [{ id: 'all', label: 'All' }, ...S.NOTE_STATUS.map((s) => ({ id: s.id, label: s.label }))]
    .map((f) => `<button data-f="${f.id}" class="${nbFilter === f.id ? 'on' : ''}">${f.label} <span>${count(f.id)}</span></button>`).join('');
}
function renderNotebook() {
  renderFilters();
  const q = nbQuery.trim().toLowerCase();
  const notes = S.allNotes().filter((n) => (nbFilter === 'all' || n.status === nbFilter)
    && (!q || (n.text + ' ' + n.subject.label + ' ' + (n.subject.category || '')).toLowerCase().includes(q)));
  const html = GROUPS.map(([g, label]) => {
    const group = notes.filter((n) => groupOf(n) === g).sort(byAge);
    if (!group.length) return '';
    return `<div class="nb-group"><h4>${label}<span>${group.length}</span></h4>${group.map((n) => noteCard(n, { showSubject: true })).join('')}</div>`;
  }).join('');
  $('#nbList').innerHTML = html || `<p class="dn-empty">${S.allNotes().length ? 'No notes match this filter.' : 'No notes yet. Click anything in the world, or a creature in the Field Guide, and write a note.'}</p>`;
  $('#nbList').querySelectorAll('.dn-card').forEach((card) => { card.setAttribute('data-nav', ''); card.tabIndex = 0; wireCard(card, (msg) => { $('#nbFoot').dataset.msg = msg; renderFooter(msg); }); });
  renderFooter();
}
function renderFooter(msg) {
  const st = S.notesState();
  const foot = $('#nbFoot');
  if (!foot) return;
  const status = st.online ? `<span class="nb-dot on"></span>Saved to <code>${esc(st.storePath)}</code> · revision ${st.revision}`
    : `<span class="nb-dot"></span>${esc(st.error || 'Connecting to the notes server…')}<div class="nb-err">Notes are read-only until the notes server runs. Open the game with Open Paradise Island.bat.</div>`;
  foot.innerHTML = `${status}${msg ? `<div class="nb-err">${esc(msg)}</div>` : ''}`;
}

/* ------------------------------------------------------------------------- wiring */
export function initNotebook() {
  notebookPane = $('#p-notebook');
  // a click on the world that is not a creature: inspect whatever is there
  cam.onWorldClick = (raycaster) => {
    const res = inspectAt(raycaster);
    if (res) openInspection(res);
  };
  $('#insGo').addEventListener('click', () => { if (insResult && insResult.pos) goTo(insResult.pos); });
  $('#insReset').addEventListener('click', () => { if (insViewer) insViewer.resetView(); });
  $('#insFull').addEventListener('click', () => { ensureInspViewer().toggleFullscreen(); });
  $('#nbFilters').addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) { nbFilter = b.dataset.f; renderNotebook(); } });
  $('#nbSearch').addEventListener('input', (e) => { nbQuery = e.target.value; renderNotebook(); });
  S.onNotesChange(() => refreshBoxes());
  S.onNotesChange(() => { if (notebookPane) renderFooter(); });
  // the viewers only draw while their panel is showing
  setInterval(() => {
    const open = (id) => { const p = document.getElementById(id); return !!p && p.classList.contains('on') && menu.isOpen() && menu.currentSection() === 'journal'; };
    if (insViewer) insViewer.setVisible(open('p-inspect') && !!insResult && !!insResult.model);
  }, 250);
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey) { menu.openMenu('journal'); document.querySelector('#p-journal .subtabs button[data-t="notebook"]').click(); }
  });
  S.loadNotes();
  renderNotebook();
}
export { S as notes };
export const inspectingNow = () => insResult;
