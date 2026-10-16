// The Collection (Journal): the things the castaway has gathered on the island. Shells, smooth stones, driftwood, feathers and unusual
// stones are kept at camp once he carries them back (castaway_life.js: stored), and are in his hand until then (carried). These are
// his finds, not supplies: nothing here is eaten or drunk.
//
// Each kind is a row the controller and the keyboard can reach. Moving onto a row shows what the find is, so the list can be read
// without the mouse. A new kind of find joins the collection by adding it to KINDS in castaway_life.js and an entry in NAME and WHAT here.
import { KINDS } from './castaway_life.js';
import { castawayAI } from './human.js';

const NAME = { shell: 'Seashells', pebble: 'Smooth stones', driftwood: 'Driftwood', feather: 'Feathers', curio: 'Unusual stones' };
const WHAT = {
  shell: 'Pale shells from the tide line. Hold one to the light and the colour shows.',
  pebble: 'Smooth stones rounded by the sea, good for a cairn.',
  driftwood: 'Bleached timber from the surf, for a bench or an arch.',
  feather: 'Feathers dropped along the ridges, where the birds come and go.',
  curio: 'Unusual stones with a sheen, found near the falls and the temple.',
};

let shownKey = '';
/** the Collection's pane: redrawn only when the numbers change, and only while the Journal's Collection tab is showing */
export function initCollection() {
  const view = document.getElementById('collection-view');
  if (!view) return;
  const detail = document.createElement('div');
  detail.className = 'coll-detail';
  detail.setAttribute('aria-live', 'polite');
  view.after(detail);
  const showDetail = (kind) => {
    const lf = castawayAI.lf;
    if (!lf || !lf.collection) return;
    const c = lf.collection(), k = kind;
    detail.innerHTML = `<b>${NAME[k] || KINDS[k].label}</b><br>${WHAT[k] || ''}<br><small>${c.stored[k] || 0} at camp, ${c.carried[k] || 0} in hand${c.firsts.includes(k) ? ' · first one found' : ''}</small>`;
  };
  const draw = () => {
    const lf = castawayAI.lf;
    if (!lf || !lf.collection) return;
    const c = lf.collection();
    const key = JSON.stringify([c.stored, c.carried, c.total, c.firsts]);
    if (key === shownKey) return;
    shownKey = key;
    const had = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.kind : null;
    const head = `<div class="coll-head"><span>Find</span><span>At camp</span><span>In hand</span></div>`;
    const rows = Object.keys(KINDS).map((k) => {
      const first = c.firsts.includes(k) ? ' <span class="coll-star" title="first one found">&#9733;</span>' : '';
      return `<button class="coll-row" data-nav data-kind="${k}"><span>${NAME[k] || KINDS[k].label}${first}</span><span>${c.stored[k] || 0}</span><span>${c.carried[k] || 0}</span></button>`;
    }).join('');
    const relics = document.getElementById('sc') ? document.getElementById('sc').textContent : '';
    view.innerHTML = head + rows +
      `<p class="note">${c.total} found in all. Finds in hand go into the collection when he gets back to camp. Relics and secrets: ${relics} (Journal, Secrets).</p>`;
    view.querySelectorAll('.coll-row').forEach((b) => b.addEventListener('focus', () => showDetail(b.dataset.kind)));
    if (had) { const again = view.querySelector(`.coll-row[data-kind="${had}"]`); if (again) again.focus({ preventScroll: true }); }
    if (!detail.innerHTML) showDetail(Object.keys(KINDS)[0]);
  };
  setInterval(() => { if (document.getElementById('p-collection')?.classList.contains('on')) draw(); }, 700);
  document.querySelector('#p-journal .subtabs button[data-t="collection"]')?.addEventListener('click', () => { shownKey = ''; draw(); });
  window.addEventListener('menu:change', () => { shownKey = ''; draw(); });
}
