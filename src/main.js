import './style.css';
import { batch, computed, effect, signal } from '@preact/signals-core';
import '../guide/bus-3d.js';
import { total } from './derive.js';
import { addAxle, addDoor, rmAxle, rmDoor, same, set, toJson } from './edit.js';
import { gallery } from './gallery.js';
import { limits } from './limits.js';
import { form, header, mapCard, modeBar, viewBar } from './ui.js';
import { validate } from './validate.js';
import { faces } from './vector.js';

const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel

const MODE_KEY = '3dbus.limits', FANTASY = 'fantasy';  // localStorage key of the limits switch, and its value for a fantasy bus
const VEHICLES = 'Concrete vehicles:', TYPE_SET = 'Type set:';  // captions of the two groups of buttons in the header
// a page of cards per set: the route is the directory under examples/ that holds the set's buses; order: its cards by class, here as the Bus Nordic tables run
const SETS = { busnordic: { title: 'BusNordic', sub: (n) => `Bus Nordic 2.0 · ${n} example bus types, generic dimensions`, order: ['a', 'i', 'ii', 'b', 'iii'] } };

const srcs = import.meta.glob('../examples/**/*.json', { eager: true, query: '?url', import: 'default' });
const buses = Object.entries(import.meta.glob('../examples/**/*.json', { eager: true, import: 'default' })).map(([p, inp]) => ({
  id: p.match(/([^/]+)\.json$/)[1],
  set: p.match(/examples\/(?:([^/]+)\/)?[^/]+$/)[1],  // undefined for a bus with a button of its own
  inp,
  src: srcs[p],
}));
const own = buses.filter((b) => !b.set);  // the buses with a button of their own
const cards = document.getElementById('cards'), pages = {};
const bus = document.querySelector('bus-3d');
const info = document.getElementById('info'), err = document.getElementById('err');
const link = document.getElementById('src'), mod = document.getElementById('mod'), drift = document.getElementById('drift');

// src: the example as loaded; draft: src with every edit, valid or not; ok: the last valid draft, which is what is drawn
const id = signal(null), src = signal(null), draft = signal(null), ok = signal(null);
const route = signal('');  // the set whose cards page is open, '' for the viewer
const DARK = matchMedia('(prefers-color-scheme: dark)');
const dark = signal(DARK.matches);  // the pictures take their colours from the page: one cards page per scheme
DARK.addEventListener('change', (e) => (dark.value = e.matches));
const touched = signal([]), fail = signal([]);  // keys edited since the bus was selected; errors of a bus that could not be selected
/** The saved limits switch; storage may be missing or blocked, and then the default (Nordic-limited) holds. */
const saved = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
const nordic = signal(saved() !== FANTASY);  // Nordic-limited: the limits count as errors; false: a fantasy bus, the schema alone
/** The errors of an input: the schema and its rules, and the Nordic limits while they are on. */
const check = (inp) => [...validate(inp), ...(nordic.value ? limits(inp) : [])];
const errs = computed(() => (draft.value ? check(draft.value) : []));
const marks = computed(() => (errs.value.length ? touched.value : []));  // what the controls show as invalid: only while the draft has errors, in either mode
const dirty = computed(() => !same(draft.value, src.value));
const maps = computed(() => (ok.value ? faces(ok.value) : null));  // the face maps of what is drawn
const mapped = mapCard(maps);
const edited = computed(() => !!ok.value && !same(ok.value, src.value));  // what is drawn differs from the file
let aim = false, stop = null;

/** Takes an edited draft: it is always kept, and drawn when it has no errors. While it has some, every control edited since the bus was selected is marked. */
const commit = (next, key) =>
  batch(() => {
    draft.value = next;
    touched.value = [...new Set([...touched.value, key])];
  });

/** Shows the chosen bus as loaded, dropping any edits. Another bus re-aims the current view; the same one does not. */
const select = (to) => {
  const inp = buses.find((b) => b.id === to)?.inp;
  fail.value = inp ? check(inp) : [`no example named ${to}`];
  if (fail.value.length) return;
  aim = to !== id.value;
  stop?.();  // before the signals change: the old form's effects must not see another bus
  batch(() => {
    id.value = to;
    src.value = draft.value = ok.value = inp;
    touched.value = [];
  });
  const [card, end] = form({ draft, ok, marks, dirty }, on);
  stop = end;
  info.replaceChildren(mapped, card);
};

// the draft is drawn once it has no errors: also when a switch to fantasy bus clears the ones it had; a switch back keeps the last legal bus
effect(() => errs.value.length || (ok.value = draft.value));
effect(() => { try { localStorage.setItem(MODE_KEY, nordic.value ? 'nordic' : FANTASY); } catch { /* the flag lasts the session */ } });

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
const routed = (h = location.hash.slice(1)) => (Object.hasOwn(SETS, h) ? h : '');
/** The bus the address bar names: ?bus=, or else the first bus in the header, the first one directly in examples/. */
const named = () => new URLSearchParams(location.search).get('bus') ?? own[0].id;
/** Opens the viewer on a bus, leaving a cards page if one is open. A new history entry names the bus, unless the address bar already does. */
const view = (to) => {
  (route.value || named() !== to) && history.pushState(null, '', `${location.pathname}?bus=${encodeURIComponent(to)}`);
  route.value = '';
  select(to);
};
/** Follows the address bar after a step in the history: its route, and in the viewer its bus. */
const follow = () => {
  route.value = routed();
  route.value || named() === id.value || select(named());
};
/** The buses of a set in the order of its cards: by class as the set lists them, the class being the second part of the id, then by length. */
const inSet = (s) =>
  buses.filter((b) => b.set === s).sort((a, b) => SETS[s].order.indexOf(a.id.split('-')[1]) - SETS[s].order.indexOf(b.id.split('-')[1]) || total(a.inp) - total(b.inp));
effect(() => {
  if (!ok.value) return;
  const r = route.value, sel = buses.find((b) => b.id === id.value);
  header(
    [
      // a selected bus of a set takes the last place among the vehicles, which is there for it alone
      { caption: VEHICLES, btns: [...own, ...(sel.set ? [sel] : [])].map((b) => ({ label: b.id, on: !r && b === sel, go: () => view(b.id) })) },
      { caption: TYPE_SET, btns: Object.entries(SETS).map(([s, { title }]) => ({ label: title, on: r === s, go: () => (location.hash = s) })) },
    ],
    { id: sel.id, inp: ok.value, src: sel.src },
    r ? { title: SETS[r].title, sub: SETS[r].sub(inSet(r).length) } : null,
  );
});
// a cards page is built, and its buses drawn, the first time it is opened in a colour scheme
effect(() => {
  const r = route.value;
  document.body.toggleAttribute('data-page', !!r);
  cards.hidden = !r;
  r && cards.replaceChildren((pages[`${r}:${dark.value}`] ??= gallery(inSet(r), view)));
});
effect(() => (document.getElementById('mode').hidden = !!route.value));
effect(() => (err.textContent = [...fail.value, ...errs.value].join('\n')));

// Modified: the bus as drawn, with its valid edits, as a file to download; there is none until an edit
effect(() => {
  const was = mod.href;
  edited.value ? (mod.href = URL.createObjectURL(new Blob([toJson(ok.value)], { type: 'application/json' }))) : mod.removeAttribute('href');
  was && URL.revokeObjectURL(was);
  Object.assign(mod, { download: `${id.value}.json`, ariaDisabled: String(!edited.value), title: edited.value ? 'Download the input JSON with your edits' : 'No edits yet' });
});

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
modeBar(nordic);

const toggle = document.getElementById('toggle');
toggle.onclick = () => (toggle.ariaExpanded = String(info.classList.toggle('open')));

// hashchange for a route opened by its button, popstate for a step that changes ?bus= alone; a step back to a route fires both
['hashchange', 'popstate'].forEach((t) => addEventListener(t, follow));
select(named());
route.value = routed();
