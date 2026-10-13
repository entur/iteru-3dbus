import { computed, effect, signal } from '@preact/signals-core';
import { DOOR, FIELDS, GROUPS, SECTION, SUMS, axleLim, get, shifted, spec } from './edit.js';
import { VIEWS } from './views.js';

const FACES = { right: 'Right', left: 'Left', front: 'Front', rear: 'Rear' };  // sides of the bus boxes a face map exists for
const BODY = { rigid: 'rigid', articulated: 'articulated', bi_articulated: 'bi-articulated' };
const CLASS = { A: 'A · small, standing', B: 'B · small, seated', I: 'I · city', II: 'II · regional', III: 'III · coach' };
const FLOOR = { low_floor: 'Low floor', low_entry: 'Low entry', normal_floor: 'Normal floor', low_floor_lower_level: 'Double deck, low lower deck' };
const ZONE = { front_overhang: 'Front overhang', between_axles: 'Between axles', rear_overhang: 'Rear overhang' };
const BIAS = { front: 'to front', middle: 'centred', rear: 'to rear' }, LEAVES = { 1: '1 leaf', 2: '2 leaves' };
/** Display names of the schema's enum values, by the key that holds them. */
export const NAMES = { body: BODY, bus_class: CLASS, floor_type: FLOOR, zone: ZONE, bias: BIAS, leaves: LEAVES };
const NOTE = 'Drawn from the input JSON only: body, wheel arches, wheels, bellows, roof pod, and the hinted doors on the right side and the windows on both. The left side has no doors of its own, and the front and rear templates are not drawn yet.';
const NONE = '–', BLACK = '#000000';
const VEHICLES = 'Concrete vehicles:', TYPE_SET = 'Type set:';  // captions of the two groups of buttons in the header
const TYPE = { int: 'number', text: 'text', bool: 'checkbox', color: 'color' };

const open = new Set(['Dimensions', 'Sections']);  // accordion groups that are open; survives edits and bus switches
let scope = null;  // disposers of the effects made while a scoped() call runs

const fmt = (n) => n.toLocaleString('en').replace(/,/g, '\u2009');
const show = (v) => [v].flat().map((x) => (typeof x === 'number' ? fmt(x) : String(x))).join(' + ') || NONE;
const cell = (c) => (c instanceof Node || typeof c === 'function' ? c : String(c));
const rows = (head, body) =>
  el('table', {}, ...(head ? [el('tr', {}, ...head.map((h) => el('th', {}, h)))] : []), ...body.map((r) => el('tr', {}, ...r.map((c) => el('td', r.length === 1 ? { colSpan: 2 } : {}, cell(c))))));
const card = (title, ...kids) => el('section', { className: 'card' }, el('h2', {}, title), ...kids);

/** Runs f as an effect that the enclosing scoped() call disposes. */
const bind = (f) => {
  const stop = effect(f);
  scope?.push(stop);
  return stop;
};
/** Runs f and returns its result with one function that disposes every effect f bound. */
const scoped = (f) => {
  const outer = scope, mine = [];
  scope = mine;
  try {
    return [f(), () => mine.splice(0).forEach((stop) => stop())];
  } finally {
    scope = outer;
  }
};
const live = (f) => {
  const t = document.createTextNode('');
  bind(() => (t.data = f()));
  return t;
};

/**
 * Tiny DOM builder: el('td', { className: 'ok' }, 'text', child). A function as a prop (other
 * than an on* handler) or as a child is bound: the prop, or a text node, follows the signals it reads.
 */
export const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (typeof v === 'function' && !k.startsWith('on') ? bind(() => (e[k] = v())) : (e[k] = v)));
  e.append(...kids.map((k) => (typeof k === 'function' ? live(k) : k)));
  return e;
};

/**
 * Fills the header: a captioned group of buttons for the buses and one for the tabs, then the title with the link to the selected
 * bus's input JSON as loaded beside it, fleet-number plate and operator line. A page takes the bus's
 * place in the title and the line below it, and has no source link.
 * @param {{id: string, inp: object, src: string, set?: string}[]} buses the buses that get a button, src is the JSON
 *   url; a bus of a set is named by its whole model
 * @param {{id: string, inp: object, src: string}} cur the selected bus, inp its input with the valid edits applied
 * @param {(id: string) => void} pick called when another bus is chosen
 * @param {{label: string, on: boolean, go: () => void}[]} [tabs] buttons after the buses, on: shown as pressed
 * @param {?{title: string, sub: string}} [page] the page shown in place of the bus
 */
export const header = (buses, cur, pick, tabs = [], page = null) => {
  const { inp, src } = cur;
  const title = page?.title ?? `${inp.brand} ${inp.model}`;
  Object.assign(document.getElementById('src'), { href: src, title: `Input JSON of ${title} as loaded` });
  document.getElementById('json').hidden = !!page;
  const group = (caption, btns) => el('div', { className: 'pick', role: 'group', ariaLabel: caption }, el('span', {}, caption), ...btns);
  document.getElementById('models').replaceChildren(
    group(VEHICLES, buses.map((b) =>
      el('button', { onclick: () => pick(b.id), ariaPressed: String(!page && b.id === cur.id) }, `${b.inp.brand} ${b.set ? b.inp.model : b.inp.model.split(' ')[0]}`))),
    ...(tabs.length ? [group(TYPE_SET, tabs.map((t) => el('button', { onclick: t.go, ariaPressed: String(t.on) }, t.label)))] : []),
  );
  document.getElementById('title').textContent = title;
  document.title = `${title} · 3dbus`;
  const plate = document.getElementById('plate');
  plate.textContent = inp.meta?.fleet_number ?? '';
  plate.hidden = !!page || !inp.meta?.fleet_number;
  document.getElementById('sub').textContent = page?.sub ?? [inp.meta?.operator, `${BODY[inp.body]}, class ${inp.bus_class}`].filter(Boolean).join(' · ');
};

/**
 * Fills the camera-view bar: one button per named view of the 3D element.
 * @param {HTMLElement} bus the bus-3d element
 */
export const viewBar = (bus) => {
  const nav = document.getElementById('views');
  const mark = () => [...nav.children].forEach((b) => (b.ariaPressed = String(b.dataset.view === bus.view)));
  nav.replaceChildren(...Object.entries(VIEWS).map(([v, [label]]) => {
    const b = el('button', { onclick: () => (bus.go(v), mark()) }, label);
    b.dataset.view = v;
    return b;
  }));
  mark();
};

/** Copy of a face map sized to its share of the row; the map itself stays untouched. */
const shown = (f) => {
  const s = f.svg.cloneNode(true);
  s.style.flex = `${f.w} 1 0`;
  return s;
};

/**
 * The 2D vector map card: tab bar, the face maps of the open side and a caption, one tab per side
 * of the box. Sections run front to rear; on the right side the front points right.
 * @param {{value: ?object}} maps signal of the face maps to show, as vector.js faces() returns them
 * @returns {HTMLElement} the card, built once and kept across buses and edits
 */
export const mapCard = (maps) => {
  const face = signal('right'), fs = computed(() => maps.value?.[face.value] ?? []);
  const row = el('div', { className: () => `faces ${face.value}` });
  bind(() => row.replaceChildren(...(face.value === 'right' ? [...fs.value].reverse() : fs.value).map(shown)));
  const cap = el('figcaption', {}, () =>
    fs.value.length ? `${fs.value.map((f) => fmt(f.w)).join(' + ')} × ${fmt(fs.value[0].h)} mm` + (fs.value.length > 1 ? `, ${fs.value.length} boxes` : '') : '');
  const tab = ([k, label]) => el('button', { onclick: () => (face.value = k), ariaPressed: () => String(face.value === k) }, label);
  return card('2D vector map', el('div', { className: 'tabs' }, ...Object.entries(FACES).map(tab)), el('figure', {}, row, cap));
};

const key = (path) => path.join('.');
const unit = (f) => f.unit ?? (String(f.path?.at(-1)).endsWith('_mm') ? 'mm' : '');
const name = (f, id) => el(id ? 'label' : 'span', id ? { htmlFor: id } : {}, f.label, ...(unit(f) ? [el('small', {}, ` ${unit(f)}`)] : []));
/** At most one call per animation frame, with the latest argument. The enclosing scoped() call drops a pending one and any later. */
const framed = (f) => {
  let v, id = 0, off = false;
  scope?.push(() => ((off = true), cancelAnimationFrame(id)));
  return (x) => {
    v = x;
    off || (id ||= requestAnimationFrame(() => ((id = 0), f(v))));
  };
};

/** Id of the control of an editable row; a derived row has its own, apart from the value its edits land on. */
const fid = (f) => `f-${f.to ? 'of-' : ''}${key(f.to ?? f.path)}`;

/**
 * Control for one editable value: shows the draft, commits through on.set, marked while an edit of it has the draft invalid.
 * A derived row shows its value of the draft and commits to `f.to`, without that value's limits. Kind `enum` is a select
 * over the schema's values, showing the default while the value is absent.
 */
const input = (st, on, f, more = {}) => {
  const { kind } = f, path = f.to ?? f.path, k = key(path), sp = f.to ? {} : spec(path);
  const val = () => (f.to ? f.of(st.draft.value) : get(st.draft.value, path));
  const mark = { id: fid(f), ariaInvalid: () => String(st.marks.value.includes(k)), ...more }, base = { type: TYPE[kind], ...mark };
  if (kind === 'enum') {
    const opts = sp.enum.map((v) => el('option', { value: v }, NAMES[path.at(-1)]?.[v] ?? String(v)));
    const s = el('select', { ...mark, onchange: (e) => on.set(path, sp.enum.find((v) => String(v) === e.target.value)) }, ...opts);
    bind(() => (s.value = String(val() ?? sp.default ?? '')));  // after the options are in: a select only takes a value it holds
    return s;
  }
  if (kind === 'bool') return el('input', { ...base, checked: () => val() ?? sp.default ?? false, onchange: (e) => on.set(path, e.target.checked) });
  if (kind === 'color') {
    const pick = framed((v) => on.set(path, v));
    return el('span', { className: 'swatch' }, el('code', {}, () => val() ?? NONE), el('input', { ...base, value: () => val() ?? BLACK, oninput: (e) => pick(e.target.value) }));
  }
  const read = (v) => (v === '' ? undefined : kind === 'int' ? Number(v) : v);
  return el('input', {
    ...base,
    ...(kind === 'int' ? { min: sp.minimum ?? '', max: sp.maximum ?? '', step: 1 } : {}),
    ...(f.hint ? { placeholder: () => f.hint(st.draft.value) ?? '' } : {}),
    value: () => val() ?? '',
    onchange: (e) => on.set(path, ((v) => (f.to ? shifted(st.draft.peek(), f, v) : v))(read(e.target.value.trim()))),
  });
};

/** One full-width row: the axle inputs of section i with remove and add. Only the inputs are rebuilt, and only when the count changes. */
const axles = (st, on, f) => {
  const i = f.path[1];
  const step = (f, to) => (e) => (f(i), e.target.disabled && e.target[to].focus());  // a button that hits its limit hands focus to the other
  const path = ['sections', i, 'axles_mm'], lim = axleLim(i), sec = `section ${i + 1}`;
  const n = computed(() => get(st.draft.value, path)?.length ?? 0);
  const list = el('span', { className: 'list' });
  bind(() => {
    const [kids, stop] = scoped(() =>
      Array.from({ length: n.value }, (_, j) => input(st, on, { path: [...path, j], kind: 'int' }, { ariaLabel: `Section ${i + 1} axle ${j + 1}` })),
    );
    list.replaceChildren(...kids);
    return stop;
  });
  return el(
    'div', { className: 'axles' }, name(f), list,
    el('button', { type: 'button', ariaLabel: `Remove the last axle of ${sec}`, disabled: () => n.value <= lim.min, onclick: step(on.rm, 'nextSibling') }, '−'),
    el('button', { type: 'button', ariaLabel: `Add an axle to ${sec}`, disabled: () => n.value >= lim.max, onclick: step(on.add, 'previousSibling') }, '+'),
  );
};

/** One door hint of section i: zone, bias and remove on a line, below it leaves, width, glazing and, between three axles, the gap. */
const door = (st, on, i, j, rm) => {
  const at = ['sections', i, 'doors_hint', j], tag = `Section ${i + 1} door ${j + 1}`;
  const ctl = (f) => input(st, on, { ...f, path: [...at, ...f.path], hint: f.hint && ((inp) => f.hint(get(inp, at) ?? {})) }, { ariaLabel: `${tag} ${f.label.toLowerCase()}` });
  const c = Object.fromEntries(DOOR.map((f) => [f.path[0], ctl(f)]));
  const gapless = () => get(st.draft.value, at)?.zone !== 'between_axles' || get(st.draft.value, ['sections', i, 'axles_mm']).length < 3;
  return el(
    'div', { className: 'door' },
    el('span', { className: 'n' }, String(j + 1)), c.zone, c.bias,
    el('button', { type: 'button', ariaLabel: `Remove ${tag.toLowerCase()}`, onclick: rm }, '−'),
    el('span', { className: 'more' }, c.leaves, el('span', {}, c.width_mm, el('small', {}, ' mm')), el('label', {}, c.glazed, ' glazed'), el('label', { hidden: gapless }, 'gap ', c.axle_gap)),
  );
};

/** One full-width row: the door hints of section i, each with its remove, and add. Only the list is rebuilt, and only when the count changes. */
const doorList = (st, on, f) => {
  const i = f.path[1], path = ['sections', i, 'doors_hint'], max = spec(path).maxItems, sec = `section ${i + 1}`;
  const n = computed(() => get(st.draft.value, path)?.length ?? 0);
  const list = el('div', { className: 'doors' });
  // a control that goes away or hits its limit hands focus on: add to the new door, remove to its neighbour or back to add
  const add = el('button', { type: 'button', ariaLabel: `Add a door to ${sec}`, disabled: () => n.value >= max, onclick: (e) => (on.addDoor(i), e.target.disabled && list.lastChild.querySelector('select').focus()) }, '+');
  const rm = (j) => () => (on.rmDoor(i, j), ((list.children[j] ?? list.lastChild)?.querySelector('button') ?? add).focus());
  bind(() => {
    const [kids, stop] = scoped(() => Array.from({ length: n.value }, (_, j) => door(st, on, i, j, rm(j))));
    list.replaceChildren(...kids);
    return stop;
  });
  return el('div', {}, el('div', { className: 'door-top' }, name(f), add), list);
};

const LISTS = { axles, doors: doorList };
/** Read-only value: the label for an enum, the schema default when absent. */
const fixed = (inp, path) => {
  const v = get(inp, path) ?? spec(path).default;
  if (v === undefined) return NONE;
  return typeof v === 'boolean' ? (v ? 'yes' : 'no') : (NAMES[path[0]]?.[v] ?? String(v));
};

/** Label and value cell of one row: derived rows follow the valid input, editable ones the draft. */
const row = (st, on, f, at = (x) => x) => {
  if (f.of && !f.edit) return [name(f), () => show(f.of(at(st.ok.value)))];
  if (!f.edit) return [name(f), fixed(st.ok.peek(), f.path)];
  return LISTS[f.kind] ? [LISTS[f.kind](st, on, f)] : [name(f, fid(f)), input(st, on, f)];
};

/** Title row of a group: its name, then greyed the derived values that sum it up. */
const title = (st, g) =>
  el('summary', {}, g, ...SUMS.filter((f) => f.groups.includes(g)).map((f) => el('small', { className: 'sum' }, `${f.label} `, () => show(f.of(st.ok.value)), ` ${f.unit}`)));

const group = (st, on, g) =>
  g === 'Sections'
    ? st.ok.peek().sections.flatMap((_, i) => [
        el('h3', {}, `Section ${i + 1}`),
        rows(null, SECTION.filter((f) => !f.trailer || i).map((f) => row(st, on, f.path ? { ...f, path: ['sections', i, ...f.path], hint: f.hint && (() => f.hint(st.ok.value, i)) } : f, (inp) => inp.sections[i]))),
      ])
    : [rows(null, FIELDS.filter((f) => f.group === g).map((f) => row(st, on, f)))];

/**
 * Builds the input card: one accordion group per part of the schema, every value in it, the
 * drawn ones editable. Built once per selected bus; the controls then follow the signals.
 * @param {{draft: object, ok: object, marks: object, dirty: object}} st signals: the edited
 *   input, its last valid state, the keys of the edits made since it was last valid, and whether
 *   the draft differs from the source
 * @param {{set: (path: (string|number)[], v: unknown) => void, add: (i: number) => void,
 *   rm: (i: number) => void, addDoor: (i: number) => void, rmDoor: (i: number, j: number) => void,
 *   reset: () => void}} on edit callbacks: a value, an axle more or less on section i, a door
 *   more on it or its door j less, drop all edits
 * @returns {[HTMLElement, () => void]} the card and the function that disposes its effects
 */
export const form = (st, on) =>
  scoped(() =>
    el(
      'section', { className: 'card input' },
      el('div', { className: 'head' }, el('h2', {}, 'Input'), el('button', { type: 'button', hidden: () => !st.dirty.value, onclick: on.reset }, 'Reset')),
      ...GROUPS.map((g) =>
        el('details', { open: open.has(g), ontoggle: (e) => (e.target.open ? open.add(g) : open.delete(g)) }, title(st, g), ...group(st, on, g)),
      ),
      el('p', { className: 'note' }, NOTE),
    ),
  );
