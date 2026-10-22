import './style.css';
import { batch, computed, effect, signal } from '@preact/signals-core';
import '../guide/bus-3d.js';
import { doorKey, total } from './derive.js';
import { addAxle, addDoor, checks, rmAxle, rmDoor, same, set, toJson } from './edit.js';
import { gallery } from './gallery.js';
import { fromNetex } from './netex.js';
import { LIST, href, parse } from './route.js';
import { form, header, mapCard, modeBar, viewBar } from './ui.js';
import { faces } from './vector.js';

const WIDE = 720, PANEL_SHIFT = 175;  // on wide screens the view shifts left, clear of the details panel

const MODE_KEY = '3dbus.limits', FANTASY = 'fantasy';  // localStorage key of the limits switch, and its value for a fantasy bus
const BASE = import.meta.env.BASE_URL;  // the path the site is served from: '/' in dev, '/iteru-3dbus/' on Pages
// the list's title, which is also the link to it; the start of the link back to the selected bus
const LIST_PAGE = { title: 'All buses', sub: (n) => `${n} NeTEx files in examples/` }, BACK = 'Back to';
// the cards of a directory under examples/ by class, the second part of the id, as the Bus Nordic tables run; then by length
const ORDER = { busnordic: ['a', 'i', 'ii', 'b', 'iii'] };

// every example twice: its url, for the Original link, and its text, read through fromNetex; a file it rejects keeps its errors, shown when it is opened
const srcs = import.meta.glob('../examples/**/*.xml', { eager: true, query: '?url', import: 'default' });
const buses = Object.entries(import.meta.glob('../examples/**/*.xml', { eager: true, query: '?raw', import: 'default' })).map(([p, xml]) => {
  const { inp, errs = [], warns = [] } = fromNetex(xml), file = p.replace('../examples/', '');
  return {
    id: p.match(/([^/]+)\.xml$/)[1],
    file,  // the path under examples/, which names the bus in /bus?file=
    set: file.match(/^(?:([^/]+)\/)?[^/]+$/)[1],  // the directory it is in, undefined directly in examples/
    inp, errs, warns,
    src: srcs[p],
    href: href({ page: 'bus', file }, BASE),
  };
});
const ids = new Map([...buses].reverse().map((b) => [b.id, b.file]));  // the file of an old ?bus=<id>; the first file of that name wins
const cls = (b) => ORDER[b.set]?.indexOf(b.id.split('-')[1]) ?? -1, len = (b) => (ORDER[b.set] && b.inp ? total(b.inp) : 0);
// the cards in order: the files directly in examples/ by name, then each directory, the rejected files last in it, by its ORDER
const listed = [...buses].sort((a, b) =>
  !!a.set - !!b.set || (a.set ?? '').localeCompare(b.set ?? '') || !a.inp - !b.inp || cls(a) - cls(b) || len(a) - len(b) || a.file.localeCompare(b.file));
const cards = document.getElementById('cards'), pages = {};
const bus = document.querySelector('bus-3d');
const info = document.getElementById('info'), err = document.getElementById('err');
const link = document.getElementById('src'), mod = document.getElementById('mod'), drift = document.getElementById('drift');

// src: the example as loaded; draft: src with every edit, valid or not; ok: the last valid draft, which is what is drawn
const file = signal(null), src = signal(null), draft = signal(null), ok = signal(null);
const sel = computed(() => buses.find((b) => b.file === file.value));  // the selected bus, undefined before one is opened
const route = signal(LIST);
const DARK = matchMedia('(prefers-color-scheme: dark)');
const dark = signal(DARK.matches);  // the pictures take their colours from the page: one cards page per scheme
DARK.addEventListener('change', (e) => (dark.value = e.matches));
const touched = signal([]), fail = signal([]);  // keys edited since the bus was selected; errors of a bus that could not be shown
const warns = signal([]);  // what fromNetex warned of when it read the selected bus's file
/** The saved limits switch; storage may be missing or blocked, and then the default (Nordic-limited) holds. */
const saved = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
const nordic = signal(saved() !== FANTASY);  // Nordic-limited: the limits count as errors; false: a fantasy bus, the schema alone
/** The errors of an input: the schema and its rules, and the Nordic limits once those pass, while they are on. */
const check = (inp) => checks(inp, nordic.value);
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

/**
 * Shows the bus of a file as loaded, dropping any edits. Another bus re-aims the current view; the same one does not.
 * Returns what stops it: an unknown file, one fromNetex rejected, or a bus failing the checks; empty when shown.
 */
const select = (to) => {
  const b = buses.find((x) => x.file === to), inp = b?.inp;
  const e = !b ? ['no such example file'] : inp ? check(inp) : b.errs;
  if (e.length) return e;
  aim = to !== file.value;
  stop?.();  // before the signals change: the old form's effects must not see another bus
  batch(() => {
    file.value = to;
    src.value = draft.value = ok.value = inp;
    touched.value = [];
    warns.value = b.warns;
  });
  const [card, end] = form({ draft, ok, marks, dirty }, on);
  stop = end;
  info.replaceChildren(mapped, card);
  return [];
};

// the draft is drawn once it has no errors: also when a switch to fantasy bus clears the ones it had; a switch back keeps the last legal bus
effect(() => errs.value.length || (ok.value = draft.value));
effect(() => { try { localStorage.setItem(MODE_KEY, nordic.value ? 'nordic' : FANTASY); } catch { /* the flag lasts the session */ } });

const on = {
  set: (path, v) => commit(set(draft.value, path, v), path.join('.')),
  add: (i) => commit(addAxle(draft.value, i), `sections.${i}.axles_mm`),
  rm: (i) => commit(rmAxle(draft.value, i), `sections.${i}.axles_mm`),
  addDoor: (i) => commit(addDoor(draft.value, i), `sections.${i}.${doorKey(draft.value.sections[i])}`),
  rmDoor: (i, j) => commit(rmDoor(draft.value, i, j), `sections.${i}.${doorKey(draft.value.sections[i])}`),
  reset: () => select(file.value),
};

effect(() => {
  const inp = ok.value;
  if (!inp) return;
  bus.faces = maps.value;
  bus.inp = inp;
});
/**
 * Goes to a route, the one way the page changes: a bus route to another file selects it, keeping the
 * edits when it is the selected one. A bus that cannot be shown gives the list instead, the reason in #err,
 * and its address is replaced. Otherwise `how` ('push' or 'replace') says what the address bar does, unless it names the route already.
 */
const show = (r, how) => {
  const e = r.page === 'bus' && r.file !== file.value ? select(r.file) : [];
  fail.value = e.map((x) => `${r.file}: ${x}`);
  const to = e.length ? LIST : r, url = href(to, BASE);
  url === location.pathname + location.search || history[`${e.length ? 'replace' : how}State`](null, '', url);
  route.value = to;
};
const toList = { label: LIST_PAGE.title, href: href(LIST, BASE), go: () => show(LIST, 'push') };
effect(() => {
  const list = route.value.page === 'list', b = sel.value;
  header(
    b && ok.value ? { id: b.id, inp: ok.value, src: b.src } : null,
    list ? { title: LIST_PAGE.title, sub: LIST_PAGE.sub(buses.length) } : null,
    !list ? toList : b ? { label: `${BACK} ${b.id}`, href: b.href, go: () => show({ page: 'bus', file: b.file }, 'push') } : null,
  );
});
// the list is built, and its buses drawn, the first time it is opened in a colour scheme
effect(() => {
  const list = route.value.page === 'list';
  document.body.toggleAttribute('data-page', list);
  cards.hidden = !list;
  list && cards.replaceChildren((pages[dark.value] ??= gallery(listed.filter((b) => b.inp), (to) => show({ page: 'bus', file: to }, 'push'))));
});
effect(() => (document.getElementById('mode').hidden = route.value.page === 'list'));
// on the list, only why a bus could not be shown
effect(() => (err.textContent = (route.value.page === 'list' ? fail.value : [...fail.value, ...errs.value, ...warns.value.map((w) => `warning: ${w}`)]).join('\n')));

// Modified: the bus as drawn, with its valid edits, as a file to download; there is none until an edit
effect(() => {
  const was = mod.href;
  edited.value ? (mod.href = URL.createObjectURL(new Blob([toJson(ok.value)], { type: 'application/json' }))) : mod.removeAttribute('href');
  was && URL.revokeObjectURL(was);
  Object.assign(mod, { download: `${sel.value?.id}.json`, ariaDisabled: String(!edited.value), title: edited.value ? 'Download the input JSON with your edits' : 'No edits yet' });
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

addEventListener('popstate', () => show(parse(location, BASE, ids), 'replace'));
show(parse(location, BASE, ids), 'replace');
