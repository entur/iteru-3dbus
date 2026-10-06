import { hints, spans, total, tyreDia } from './derive.js';
import { faces } from './vector.js';

const BODY = { rigid: 'rigid', articulated: 'articulated', bi_articulated: 'bi-articulated' };
const CLASS = { A: 'A · small, standing', B: 'B · small, seated', I: 'I · city', II: 'II · regional', III: 'III · coach' };
const FLOOR = { low_floor: 'Low floor', low_entry: 'Low entry', normal_floor: 'Normal floor', low_floor_lower_level: 'Double deck, low lower deck' };
const NOTE = 'Drawn from the input JSON only: body, wheel arches, wheels, bellows and roof pod. Doors, windows and the front and rear templates are not drawn yet.';
const FACES = { right: 'Right', left: 'Left', front: 'Front', rear: 'Rear' };

let tab = 'right';

const fmt = (n) => n.toLocaleString('en').replace(/,/g, '\u2009');
const rows = (head, body) =>
  el('table', {}, ...(head ? [el('tr', {}, ...head.map((h) => el('th', {}, h)))] : []), ...body.map((r) => el('tr', {}, ...r.map((c) => el('td', {}, String(c))))));
const card = (title, ...kids) => el('section', { className: 'card' }, el('h2', {}, title), ...kids);

/** Tiny DOM builder: el('td', { className: 'ok' }, 'text', child). */
export const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

/**
 * Fills the header: one button per bus, then the title with a link to the selected bus's raw
 * input JSON beside it, fleet-number plate and operator line.
 * @param {{id: string, inp: object, src: string}[]} buses all selectable buses, src is the JSON url
 * @param {string} id the selected bus
 * @param {(id: string) => void} pick called when another bus is chosen
 */
export const header = (buses, id, pick) => {
  const { inp, src } = buses.find((b) => b.id === id);
  const title = `${inp.brand} ${inp.model}`;
  Object.assign(document.getElementById('src'), { href: src, title: `Raw input JSON for ${title}` });
  document.getElementById('models').replaceChildren(
    ...buses.map((b) =>
      el('button', { onclick: () => pick(b.id), ariaPressed: String(b.id === id) }, `${b.inp.brand} ${b.inp.model.split(' ')[0]}`),
    ),
  );
  document.getElementById('title').textContent = title;
  document.title = `${title} · 3dbus`;
  const plate = document.getElementById('plate');
  plate.textContent = inp.meta?.fleet_number ?? '';
  plate.hidden = !inp.meta?.fleet_number;
  document.getElementById('sub').textContent = [inp.meta?.operator, `${BODY[inp.body]}, class ${inp.bus_class}`].filter(Boolean).join(' · ');
};

/** Tabbed view of the face maps: one tab per side of the box, one map per box. */
const faceTabs = (inp) => {
  const maps = faces(inp), view = el('div', { className: 'faces' }), cap = el('figcaption');
  const bar = el('div', { className: 'tabs' });
  const show = (k) => {
    tab = k;
    const fs = maps[k], order = k === 'right' ? [...fs].reverse() : fs;
    view.className = `faces ${k}`;
    view.replaceChildren(...order.map((f) => (f.svg.style.flex = `${f.w} 1 0`, f.svg)));
    cap.textContent = `${fs.map((f) => fmt(f.w)).join(' + ')} × ${fmt(fs[0].h)} mm` + (fs.length > 1 ? `, ${fs.length} boxes` : '');
    [...bar.children].forEach((b) => (b.ariaPressed = String(b.dataset.face === k)));
  };
  bar.append(...Object.entries(FACES).map(([k, label]) => {
    const b = el('button', { onclick: () => show(k) }, label);
    b.dataset.face = k;
    return b;
  }));
  show(tab);
  return [bar, el('figure', {}, view, cap)];
};

/**
 * Fills the details panel: the 2D face maps projected onto the bus boxes, then one card each
 * for dimensions, sections and classification.
 * @param {object} inp validated bus input
 */
export const cards = (inp) => {
  const doors = hints(inp);
  const side = inp.door_side ?? 'right';
  document.getElementById('info').replaceChildren(
    card(
      '2D vector map',
      ...faceTabs(inp),
    ),
    card(
      'Dimensions',
      rows(['mm', ''], [
        ['Length', fmt(total(inp))],
        ['Width', fmt(inp.width_mm)],
        ['Height', fmt(inp.height_mm)],
        ['Roof equipment', fmt(inp.roof_equipment_mm ?? 0)],
        ['Tyre diameter', fmt(tyreDia(inp.tyre))],
      ]),
    ),
    card(
      'Sections',
      rows(['mm', 'Length', 'Front', 'Wheelbase', 'Rear'], inp.sections.map((s, i) => {
        const sp = spans(s);
        return [i + 1, fmt(s.length_mm), fmt(sp.front), sp.wheelbases.map(fmt).join(' + ') || '–', fmt(sp.rear)];
      })),
    ),
    card(
      'Classification',
      rows(null, [
        ['Body', BODY[inp.body]],
        ['Class', CLASS[inp.bus_class]],
        ['Floor', FLOOR[inp.floor_type]],
        ['Doors', doors.length ? `${doors.length} hinted, ${side} side` : 'class default'],
      ]),
      el('p', { className: 'note' }, NOTE),
    ),
  );
};
