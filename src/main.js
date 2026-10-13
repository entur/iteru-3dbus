import './style.css';
import { batch, computed, effect, signal } from '@preact/signals-core';
import '../guide/bus-3d.js';
import { addAxle, addDoor, rmAxle, rmDoor, same, set, signed } from './edit.js';
import { gallery } from './gallery.js';
import { form, header, mapCard, viewBar } from './ui.js';
import { validate } from './validate.js';
import { faces } from './vector.js';

const FIRST = 'volvo-8900';
const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel

// a page of cards per set: the route is the directory under examples/ that holds the set's buses
const SETS = { busnordic: { label: 'BusNordic', title: 'BusNordic', sub: (n) => `Bus Nordic 2.0 · ${n} example bus types, generic dimensions` } };

const srcs = import.meta.glob('../examples/**/*.json', { eager: true, query: '?url', import: 'default' });
const buses = Object.entries(import.meta.glob('../examples/**/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  set: p.match(/examples\/(?:([^/]+)\/)?[^/]+$/)[1],  // undefined for a bus with a button of its own
  inp,
  src: srcs[p],
}));
const cards = document.getElementById('cards'), pages = {};
const bus = document.querySelector('bus-3d');
const info = document.getElementById('info'), err = document.getElementById('err');
const link = document.getElementById('src'), drift = document.getElementById('drift');

// src: the example as loaded; draft: src with every edit, valid or not; ok: the last valid draft, which is what is drawn
const id = signal(null), src = signal(null), draft = signal(null), ok = signal(null);
const route = signal('');  // the set whose cards page is open, '' for the viewer
const marks = signal([]), fail = signal([]);  // keys edited since the draft was last valid; errors of a bus that could not be selected
const errs = computed(() => (draft.value ? validate(draft.value) : []));
const dirty = computed(() => !same(draft.value, src.value));
const maps = computed(() => (ok.value ? faces(signed(ok.value)) : null));  // the face maps of what is drawn
const mapped = mapCard(maps);
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
  info.replaceChildren(mapped, card);
};

const on = {
  set: (path, v) => commit(set(draft.value, path, v), path.join('.')),
  add: (i) => commit(addAxle(draft.value, i), `sections.${i}.axles_mm`),
  rm: (i) => commit(rmAxle(draft.value, i), `sections.${i}.axles_mm`),
  addDoor: (i) => commit(addDoor(draft.value, i), `sections.${i}.doors_hint`),
  rmDoor: (i, j) => commit(rmDoor(draft.value, i, j), `sections.${i}.doors_hint`),
  reset: () => select(id.value),
};

effect(() => {
  const inp = ok.value;
  if (!inp) return;
  bus.faces = maps.value;
  bus.inp = inp;
});
/** The route in the address bar: a set's name as the hash, anything else is the viewer. */
const routed = () => (Object.hasOwn(SETS, location.hash.slice(1)) ? location.hash.slice(1) : '');
/** Opens the viewer on a bus, leaving a cards page if one is open. */
const view = (to) => {
  route.value && history.pushState(null, '', location.pathname + location.search);
  route.value = '';
  select(to);
};
const inSet = (s) => buses.filter((b) => b.set === s);

effect(() => {
  if (!ok.value) return;
  const r = route.value, tabs = Object.entries(SETS).map(([s, { label }]) => ({ label, on: r === s || (!r && buses.find((b) => b.id === id.value).set === s), go: () => (location.hash = s) }));
  const cur = { id: id.value, inp: ok.value, src: buses.find((b) => b.id === id.value).src };
  header(buses.filter((b) => !b.set), cur, view, tabs, r ? { title: SETS[r].title, sub: SETS[r].sub(inSet(r).length) } : null);
});
// a cards page is built, and its buses drawn, the first time it is opened
effect(() => {
  const r = route.value;
  document.body.toggleAttribute('data-page', !!r);
  cards.hidden = !r;
  r && cards.replaceChildren((pages[r] ??= gallery(inSet(r), view)));
});
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

['hashchange', 'popstate'].forEach((t) => addEventListener(t, () => (route.value = routed())));
select(new URLSearchParams(location.search).get('bus') ?? FIRST);
route.value = routed();
