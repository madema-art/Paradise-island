// The Collection (Journal): the things the castaway has gathered on the island. Shells, smooth stones, driftwood, feathers and unusual
// stones are kept at camp once he carries them back (castaway_life.js: stored), and are in his hand until then (carried). These are
// his finds, not supplies: nothing here is eaten or drunk. A new kind of find joins the collection by adding it to KINDS in
// castaway_life.js and a name below; until then it is shown by its label.
import { KINDS } from './castaway_life.js';
import { castawayAI } from './human.js';

const NAME = { shell: 'Seashells', pebble: 'Smooth stones', driftwood: 'Driftwood', feather: 'Feathers', curio: 'Unusual stones' };

/** the Collection's pane: redrawn only when the numbers change, and only while the Journal's Collection tab is showing */
export function initCollection() {
  const view = document.getElementById('collection-view');
  if (!view) return;
  let last = '';
  const draw = () => {
    const lf = castawayAI.lf;
    if (!lf || !lf.collection) return;
    const c = lf.collection();
    const rows = Object.keys(KINDS).map((k) => {
      const first = c.firsts.includes(k) ? ' <span title="first one found">&#9733;</span>' : '';
      return `<tr><td>${NAME[k] || KINDS[k].label}${first}</td><td>${c.stored[k] || 0}</td><td>${c.carried[k] || 0}</td></tr>`;
    }).join('');
    const html = `<table><tr><th>Find</th><th>At camp</th><th>In hand</th></tr>${rows}</table>` +
      `<p class="note">${c.total} found in all. Finds in hand go into the collection when he gets back to camp.</p>`;
    if (html !== last) { last = html; view.innerHTML = html; }
  };
  setInterval(() => { if (document.getElementById('p-collection')?.classList.contains('on')) draw(); }, 700);
  document.querySelector('#p-journal .subtabs button[data-t="collection"]')?.addEventListener('click', draw);
  window.addEventListener('menu:change', draw);
}
