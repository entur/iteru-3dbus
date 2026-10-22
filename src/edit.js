import schema from '../schema/bus-input.schema.json' with { type: 'json' };
import { dashDefault, doorWidth, spans, total, tyreDia, windows } from './derive.js';

const DEFS = schema.$defs;

/** Accordion groups of the input card, in order. Sections is filled from SECTION, once per section. */
export const GROUPS = ['Dimensions', 'Tyre', 'Colour', 'Front', 'Sections'];

/**
 * One row per input value outside the sections, plus the derived rows. A row has a `path` into
 * the input or an `of` that derives its value; `edit` marks the values the renderer draws, with
 * `kind` (text, int, bool, color) picking the control. `hint` gives the placeholder of an empty
 * control, `unit` the unit of a derived value. A derived row that is editable names in `to` the
 * input value its edits land on (see `shifted`).
 */
export const FIELDS = [
  { group: 'Dimensions', label: 'Length', of: total, unit: 'mm', kind: 'int', edit: true, to: ['sections', 0, 'length_mm'] },
  { group: 'Dimensions', label: 'Width', path: ['width_mm'], kind: 'int', edit: true },
  { group: 'Dimensions', label: 'Height', path: ['height_mm'], kind: 'int', edit: true },
  { group: 'Dimensions', label: 'Roof equipment', path: ['roof_equipment_mm'], kind: 'int', edit: true },
  { group: 'Dimensions', label: 'Band above doors', path: ['band_above_mm'], kind: 'int', edit: true, hint: () => spec(['band_above_mm']).default },
  { group: 'Dimensions', label: 'Window band height', path: ['win_band_height_mm'], kind: 'int', edit: true, hint: () => spec(['win_band_height_mm']).default },
  { group: 'Dimensions', label: 'Band below grille', path: ['band_below_grill_mm'], kind: 'int', edit: true, hint: () => spec(['band_below_grill_mm']).default },
  { group: 'Dimensions', label: 'Band below windshield', path: ['band_below_windshield_mm'], kind: 'int', edit: true, hint: dashDefault },
  { group: 'Tyre', label: 'Size', path: ['tyre', 'size'], kind: 'text', edit: true },
  { group: 'Tyre', label: 'Diameter', path: ['tyre', 'diameter_mm'], kind: 'int', edit: true },
  { group: 'Tyre', label: 'Effective diameter', of: (inp) => tyreDia(inp.tyre), unit: 'mm' },
  { group: 'Tyre', label: 'Twin rear', path: ['tyre', 'rear_twin'], kind: 'bool', edit: true },
  { group: 'Colour', label: 'Base', path: ['base_color', 'hex'], kind: 'color', edit: true },
  { group: 'Front', label: 'Badge text', path: ['front', 'badge_text'], kind: 'text', edit: true },
  { group: 'Front', label: 'Display', path: ['front_display'], kind: 'text', edit: true, blank: true },
];

/** Derived values shown on the title row of the groups they sum up, so they are readable with the group closed. */
export const SUMS = [{ groups: ['Sections'], label: 'Tot.len', of: total, unit: 'mm' }];

/**
 * Rows of one section, as FIELDS but with `path` and `of` relative to the section. `trailer`
 * rows exist from the second section on; kinds `axles` and `doors` are lists with their add and
 * remove. `hint` reads the last valid input and the section's index.
 */
export const SECTION = [
  { label: 'Length', path: ['length_mm'], kind: 'int', edit: true },
  { label: 'Bellows ahead', path: ['bellows_ahead_mm'], kind: 'int', edit: true, trailer: true },
  { label: 'Axles', path: ['axles_mm'], kind: 'axles', edit: true },
  { label: 'Front overhang', of: (s) => spans(s).front, unit: 'mm' },
  { label: 'Wheelbase', of: (s) => spans(s).wheelbases, unit: 'mm' },
  { label: 'Rear overhang', of: (s) => spans(s).rear, unit: 'mm' },
  { label: 'Doors', path: ['doors_hint'], kind: 'doors', edit: true },
  { label: 'Windows', path: ['windows_hint', 'count'], kind: 'int', edit: true, hint: (inp, i) => windows(inp)[i].length },
];

/**
 * Rows of one door hint, as SECTION but relative to the hint: every value is drawn, so every one
 * is editable. Kind `enum` picks one of the schema's values; `hint` reads the hint itself.
 */
export const DOOR = [
  { label: 'Zone', path: ['zone'], kind: 'enum', edit: true },
  { label: 'Bias', path: ['bias'], kind: 'enum', edit: true },
  { label: 'Leaves', path: ['leaves'], kind: 'enum', edit: true },
  { label: 'Width', path: ['width_mm'], kind: 'int', edit: true, hint: (d) => doorWidth({ leaves: d.leaves }) },
  { label: 'Glazed', path: ['glazed'], kind: 'bool', edit: true },
  { label: 'Axle gap', path: ['axle_gap'], kind: 'int', edit: true, hint: () => DEFS.door_hint.properties.axle_gap.default },
];

const bare = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const put = (o, k, v) => {
  if (Array.isArray(o)) return o.map((x, i) => (i === k ? v : x));
  const { [k]: _, ...rest } = o;
  return v === undefined ? rest : k in o ? { ...o, [k]: v } : { ...rest, [k]: v };
};

/**
 * Reads the value at a path.
 * @param {object} inp bus input
 * @param {(string|number)[]} path keys from the root, e.g. ['sections', 1, 'axles_mm', 0]
 * @returns {unknown} the value, undefined when any step is absent
 */
export const get = (inp, path) => path.reduce((o, k) => o?.[k], inp);

/**
 * Writes the value at a path into a copy; the input is left alone. undefined removes the key,
 * and with it a parent object left empty; a missing parent object is created.
 * @param {object} inp bus input
 * @param {(string|number)[]} path keys from the root
 * @param {unknown} v new value
 * @returns {object} the edited copy
 */
export const set = (inp, [k, ...rest], v) => {
  if (!rest.length) return put(inp, k, v);
  const kid = set(inp[k] ?? {}, rest, v);
  return put(inp, k, v === undefined && bare(kid) && !Object.keys(kid).length ? undefined : kid);
};

/**
 * Deep equality that ignores key order, so a key removed and filled in again counts as unchanged.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export const same = (a, b) => {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (!bare(a) || !bare(b)) return false;
  const ks = Object.keys(a);
  return ks.length === Object.keys(b).length && ks.every((k) => k in b && same(a[k], b[k]));
};

/**
 * The value to write at `f.to` so that the derived value of row f becomes v: the difference is
 * added there, everything else is left alone.
 * @param {object} inp bus input
 * @param {{of: (inp: object) => number, to: (string|number)[]}} f editable derived row
 * @param {number|undefined} v the wanted derived value
 * @returns {number|undefined} the value for `f.to`, undefined when v is
 */
export const shifted = (inp, f, v) => (v === undefined ? undefined : get(inp, f.to) + v - f.of(inp));

const deref = (n) => (n.$ref ? DEFS[n.$ref.split('/').at(-1)] : n);
/** The schema one step down: a property, or for an index the items of a list; a $ref is followed. */
const down = (s, k) => deref(typeof k === 'number' ? s.items : s.properties[k]);

/**
 * The schema of the value at a path: limits, default, enum.
 * @param {(string|number)[]} path keys from the root; under sections the index picks lead or trailer
 * @returns {object} schema node; for a value of a section, section_common merged with the lead
 *   or trailer rules, and from there on down into its lists and its windows hint
 */
export const spec = ([k, ...rest]) =>
  k === 'sections'
    ? rest.slice(2).reduce(down, deref({ ...DEFS.section_common.properties[rest[1]], ...(rest[0] ? DEFS.trailer_section : DEFS.lead_section).properties[rest[1]] }))
    : rest.reduce((s, x) => s.properties[x], schema.properties[k]);

/**
 * How many axles section i may have, from the schema.
 * @param {number} i section index
 * @returns {{min: number, max: number}}
 */
export const axleLim = (i) => {
  const { minItems: min, maxItems: max } = spec(['sections', i, 'axles_mm']);
  return { min, max };
};

/**
 * Appends an axle to section i, halfway between its last axle and its rear end.
 * @param {object} inp bus input
 * @param {number} i section index
 * @returns {object} the edited copy
 */
export const addAxle = (inp, i) => {
  const { axles_mm: a, length_mm: len } = inp.sections[i];
  return set(inp, ['sections', i, 'axles_mm'], [...a, Math.round(((a.at(-1) ?? 0) + len) / 2)]);
};

/**
 * Removes the last axle of section i.
 * @param {object} inp bus input
 * @param {number} i section index
 * @returns {object} the edited copy
 */
export const rmAxle = (inp, i) => set(inp, ['sections', i, 'axles_mm'], inp.sections[i].axles_mm.slice(0, -1));

/**
 * Appends a door hint to section i: two leaves, in the zone that holds the fewest doors so far.
 * A section with one axle has no zone between axles.
 * @param {object} inp bus input
 * @param {number} i section index
 * @returns {object} the edited copy
 */
export const addDoor = (inp, i) => {
  const s = inp.sections[i], ds = s.doors_hint ?? [], n = (z) => ds.filter((d) => d.zone === z).length;
  const zone = DEFS.door_hint.properties.zone.enum
    .filter((z) => z !== 'between_axles' || s.axles_mm.length > 1)
    .reduce((a, z) => (n(z) < n(a) ? z : a));
  return set(inp, ['sections', i, 'doors_hint'], [...ds, { zone, leaves: 2 }]);
};

/**
 * Removes door hint j of section i, and the list with its last one.
 * @param {object} inp bus input
 * @param {number} i section index
 * @param {number} j index of the hint
 * @returns {object} the edited copy
 */
export const rmDoor = (inp, i, j) => {
  const ds = inp.sections[i].doors_hint.filter((_, k) => k !== j);
  return set(inp, ['sections', i, 'doors_hint'], ds.length ? ds : undefined);
};

/**
 * A bus input as the text of a JSON file: its keys in the order they have, two spaces of indent.
 * @param {object} inp bus input
 * @returns {string} the file's text, ending in a newline
 */
export const toJson = (inp) => `${JSON.stringify(inp, null, 2)}\n`;

/**
 * The value the text of a row's control stands for: a number on an int row, and nothing for an
 * emptied control, which takes the value out of the input. A row marked `blank` keeps the empty
 * string instead: there, empty is a value of its own.
 * @param {{kind?: string, blank?: boolean}} f row of FIELDS, SECTION or DOOR
 * @param {string} text the control's text, trimmed
 * @returns {string|number|undefined}
 */
export const typed = (f, text) => (text === '' ? (f.blank ? '' : undefined) : f.kind === 'int' ? Number(text) : text);
