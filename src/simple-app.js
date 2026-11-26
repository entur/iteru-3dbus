import './style.css';
import '../guide/bus-3d.js';
import { fromSpec } from './spec.js';
import { viewBar } from './ui.js';
import { faces } from './vector.js';

const START = {
  length_mm: 12000, width_mm: 2550, height_mm: 3200, decks: 'single', articulated: false, low_floor: true, doors: '2+2',
  axles: 2,
};
const NUMS = [['length_mm', 'Total length (mm)', 3000, 30000], ['width_mm', 'Total width (mm)', 1500, 4000], ['height_mm', 'Total height (mm)', 1500, 6000]];

const spec = structuredClone(START);
const form = document.getElementById('spec'), bus = document.querySelector('bus-3d'), err = document.getElementById('err');

/** Builds an element: props assigned, children appended. */
const h = (tag, props, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
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

const check = (key, label) => h('label', { className: 'chk' }, h('input', { type: 'checkbox', checked: spec[key], onchange: change((t) => (spec[key] = t.checked)) }), label);

form.append(
  h('h1', {}, 'Simple editor'),
  h('a', { href: `${import.meta.env.BASE_URL}list`, textContent: 'All buses', className: 'back' }),
  h('p', { className: 'hint' }, 'A rough bus from a few properties.'),
  ...NUMS.map(([k, label, min, max]) => field(label, h('input', { type: 'number', value: spec[k], min, max, step: 10, oninput: change((t) => (spec[k] = t.valueAsNumber)) }))),
  field('Decks', h('select', { onchange: change((t) => (spec.decks = t.value)) },
    ...['single', 'double'].map((v) => h('option', { value: v, textContent: v, selected: spec.decks === v })))),
  field('Number of axles', h('input', { type: 'number', value: spec.axles, min: 2, max: 4, step: 1, oninput: change((t) => (spec.axles = t.valueAsNumber)) })),
  check('articulated', 'Articulated'),
  check('low_floor', 'Low floor'),
  field('Doors (leaves each, front to rear)', h('input', { value: spec.doors, placeholder: '2+2+2', oninput: change((t) => (spec.doors = t.value)) })),
);
form.onsubmit = (e) => e.preventDefault();
viewBar(bus);
draw();
