import './style.css';
import { batch, computed, effect, signal } from '@preact/signals-core';
import './bus-2d.js';
import './bus-3d.js';
import { addAxle, rmAxle, same, set } from './edit.js';
import { form, header, mapCard, viewBar } from './ui.js';
import { validate } from './validate.js';

const FIRST = 'volvo-8900';
const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel

const srcs = import.meta.glob('../examples/*.json', { eager: true, query: '?url', import: 'default' });
const buses = Object.entries(import.meta.glob('../examples/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  inp,
  src: srcs[p],
}));
const bus = document.querySelector('bus-3d'), map = document.createElement('bus-2d');
const info = document.getElementById('info'), err = document.getElementById('err');
const link = document.getElementById('src'), drift = document.getElementById('drift');
const maps = mapCard(map);

// src: the example as loaded; draft: src with every edit, valid or not; ok: the last valid draft, which is what is drawn
const id = signal(null), src = signal(null), draft = signal(null), ok = signal(null);
const marks = signal([]), fail = signal([]);  // keys edited since the draft was last valid; errors of a bus that could not be selected
const errs = computed(() => (draft.value ? validate(draft.value) : []));
const dirty = computed(() => !same(draft.value, src.value));
let aim = false, stop = null;

/** Takes an edited draft: it is always kept, and drawn when valid. While it is invalid, every control edited stays marked. */
const commit = (next, key) =>
  batch(() => {
    draft.value = next;
    marks.value = errs.value.length ? [...new Set([...marks.value, key])] : [];
    errs.value.length || (ok.value = next);
  });

/** Shows the chosen bus as loaded, dropping any edits. Another bus re-aims the current view; the same one does not. */
const select = (to) => {
  const inp = buses.find((b) => b.id === to)?.inp;
  fail.value = inp ? validate(inp) : [`no example named ${to}`];
  if (fail.value.length) return;
  aim = to !== id.value;
  stop?.();  // before the signals change: the old form's effects must not see another bus
  batch(() => {
    id.value = to;
    src.value = draft.value = ok.value = inp;
    marks.value = [];
  });
  const [card, end] = form({ draft, ok, marks, dirty }, on);
  stop = end;
  info.replaceChildren(maps, card);
};

const on = {
  set: (path, v) => commit(set(draft.value, path, v), path.join('.')),
  add: (i) => commit(addAxle(draft.value, i), `sections.${i}.axles_mm`),
  rm: (i) => commit(rmAxle(draft.value, i), `sections.${i}.axles_mm`),
  reset: () => select(id.value),
};

effect(() => {
  const inp = ok.value;
  if (!inp) return;
  map.inp = inp;
  bus.faces = map.faces;
  bus.inp = inp;
});
effect(() => ok.value && header(buses, id.value, ok.value, select));
effect(() => (err.textContent = [...fail.value, ...errs.value].join('\n')));

bus.addEventListener('busrender', () => aim && ((aim = false), bus.go()));
bus.addEventListener('buserror', (e) => (fail.value = e.detail.errors));

// the source link still opens the file, but warns first when the model no longer matches it
link.onclick = (e) => {
  if (!dirty.value) return;
  e.preventDefault();
  drift.returnValue = '';
  drift.showModal();
};
drift.onclose = () => drift.returnValue === 'ok' && open(link.href, '_blank', 'noopener');

const wide = matchMedia(`(min-width: ${WIDE + 1}px)`);
const shift = () => (bus.offsetX = wide.matches ? PANEL_SHIFT : 0);
wide.addEventListener('change', shift);
shift();
viewBar(bus);

const toggle = document.getElementById('toggle');
toggle.onclick = () => (toggle.ariaExpanded = String(info.classList.toggle('open')));

select(new URLSearchParams(location.search).get('bus') ?? FIRST);
