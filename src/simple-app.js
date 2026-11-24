import './style.css';
import '../guide/bus-3d.js';
import { fromSpec } from './spec.js';
import { viewBar } from './ui.js';
import { faces } from './vector.js';

const TYRES = ['295/80 R22.5', '275/70 R22.5', '315/60 R22.5', '235/75 R17.5'];  // suggestions for the tyre field
const START = {
  length_mm: 12000, width_mm: 2550, height_mm: 3200, decks: 'single', articulated: false, low_floor: true, doors: '2+2',
  axles: [{ tyre: '295/80 R22.5', twin: false }, { tyre: '295/80 R22.5', twin: true }],
};
const NUMS = [['length_mm', 'Total length (mm)', 3000, 30000], ['width_mm', 'Total width (mm)', 1500, 4000], ['height_mm', 'Total height (mm)', 1500, 6000]];

const spec = structuredClone(START);
const form = document.getElementById('spec'), bus = document.querySelector('bus-3d'), err = document.getElementById('err');

/** Builds an element: props assigned, children appended. `list` and `aria-*` have no setter, so they are attributes. */
const ATTR = (k) => k === 'list' || k.startsWith('aria-');
const h = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => (ATTR(k) ? e.setAttribute(k, v) : (e[k] = v)));
  e.append(...kids);
  return e;
};
const field = (label, input) => h('label', { className: 'f' }, h('span', {}, label), input);

/** Draws the bus of the current spec; an invalid one leaves the last drawing and lists its errors. */
const draw = () => {
  const r = fromSpec({ ...spec, doors: spec.doors.trim() === '' ? [] : spec.doors });
  err.textContent = r.ok ? '' : r.errs.join('\n');
  if (!r.ok) return;
  bus.faces = faces(r.inp);
  bus.inp = r.inp;
};
const change = (fn) => (e) => (fn(e.target), draw());

/** The axle rows are rebuilt when their count changes; the rest of the form stays, with its focus. */
const axleRows = h('div', { className: 'axles' });
const rows = () =>
  axleRows.replaceChildren(
    ...spec.axles.map((a, i) => h('div', { className: 'axle' },
      h('span', {}, `Axle ${i + 1}`),
      h('input', { value: a.tyre, list: 'tyres', 'aria-label': `Axle ${i + 1} tyre`, title: 'A size like 295/80 R22.5, or a diameter in mm', size: 12, oninput: change((t) => (a.tyre = t.value)) }),
      h('label', { className: 'chk' }, h('input', { type: 'checkbox', checked: !!a.twin, onchange: change((t) => (a.twin = t.checked)) }), 'Twin'),
      h('button', { type: 'button', textContent: '✕', title: 'Remove axle', disabled: spec.axles.length <= 2, onclick: () => (spec.axles.splice(i, 1), rows(), draw()) }))),
    h('button', { type: 'button', textContent: 'Add axle', disabled: spec.axles.length >= 4, onclick: () => (spec.axles.push({ tyre: spec.axles.at(-1).tyre, twin: true }), rows(), draw()) }));

const check = (key, label) => h('label', { className: 'chk' }, h('input', { type: 'checkbox', checked: spec[key], onchange: change((t) => (spec[key] = t.checked)) }), label);

form.append(
  h('h1', {}, 'Simple editor'),
  h('a', { href: `${import.meta.env.BASE_URL}list`, textContent: 'All buses', className: 'back' }),
  h('p', { className: 'hint' }, 'A rough bus from a few properties.'),
  ...NUMS.map(([k, label, min, max]) => field(label, h('input', { type: 'number', value: spec[k], min, max, step: 10, oninput: change((t) => (spec[k] = t.valueAsNumber)) }))),
  field('Decks', h('select', { onchange: change((t) => (spec.decks = t.value)) },
    ...['single', 'double'].map((v) => h('option', { value: v, textContent: v, selected: spec.decks === v })))),
  check('articulated', 'Articulated'),
  check('low_floor', 'Low floor'),
  field('Doors (leaves each, front to rear)', h('input', { value: spec.doors, placeholder: '2+2+2', oninput: change((t) => (spec.doors = t.value)) })),
  h('fieldset', {}, h('legend', {}, 'Axles, front to rear'), axleRows),
  h('datalist', { id: 'tyres' }, ...TYRES.map((t) => h('option', { value: t }))),
);
form.onsubmit = (e) => e.preventDefault();
rows();
viewBar(bus);
draw();
