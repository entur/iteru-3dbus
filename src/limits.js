import { doors, total } from './derive.js';

const MAX_W = 2550, MAX_H = 4400, TWO_DOOR_LEN = 9500;
/** Longest legal bus in mm: by section count, and for one section by its axle count. */
const MAX_LEN = { 1: { 2: 13500, 3: 15000 }, 2: 18750, 3: 24000 };

const over = (name, v, max) => (v > max ? [`${name} ${v} mm exceeds ${max} mm`] : []);

/** The length limit for a bus, or undefined when its section and axle count are not in the table. */
const maxLen = (inp) => {
  const m = MAX_LEN[inp.sections.length];
  return typeof m === 'object' ? m[inp.sections[0].axles_mm.length] : m;
};

/**
 * Regulation checks (Nordic limits) that the schema leaves out: width, height, total length by
 * sections and axles, and two doors over 9500 mm. A bus that names no doors is not checked for them.
 * @param {object} inp validated bus input
 * @returns {string[]} one message per limit exceeded, empty when legal
 */
export const limits = (inp) => {
  const len = total(inp), max = maxLen(inp);
  const named = inp.sections.some((s) => s.doors_hint);
  const n = doors(inp).flat().length;
  return [
    ...over('width', inp.width_mm, MAX_W),
    ...over('height', inp.height_mm, MAX_H),
    ...(max === undefined ? [] : over('total length', len, max)),
    ...(named && len > TWO_DOOR_LEN && n < 2 ? [`total length ${len} mm over ${TWO_DOOR_LEN} mm needs two doors, has ${n}`] : []),
  ];
};
