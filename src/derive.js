import { ARCH_GAP, CLEARANCE } from './dims.js';

const INCH = 25.4;
const SIZE = /^(\d{3})\/(\d{2}) ?R(\d{2}(?:\.\d)?)$/;

/**
 * Lays the sections out along the bus, front to rear.
 * @param {object} inp validated bus input
 * @returns {{x0: number, len: number, axles: number[], local: number[], bellows: number}[]} per
 *   section: start x, length, axle x and bellows ahead, all in mm from the front end; local is
 *   the axle x from the section's own front
 */
export const layout = (inp) =>
  inp.sections.reduce((acc, s) => {
    const prev = acc.at(-1);
    const bellows = s.bellows_ahead_mm ?? 0;
    const x0 = (prev ? prev.x0 + prev.len : 0) + bellows;
    return [...acc, { x0, len: s.length_mm, axles: s.axles_mm.map((a) => x0 + a), local: s.axles_mm, bellows }];
  }, []);

/**
 * Height of the body box: the roof pod sits on top of it.
 * @param {object} inp validated bus input
 * @returns {number} mm above ground
 */
export const bodyTop = (inp) => inp.height_mm - (inp.roof_equipment_mm ?? 0);

/**
 * All door hints, front to rear.
 * @param {object} inp validated bus input
 * @returns {object[]} door hints across the sections
 */
export const hints = (inp) => inp.sections.flatMap((s) => s.doors_hint ?? []);

/**
 * Wheel arch: a circle around the axle centre, cut off by the skirt.
 * @param {number} r tyre radius, mm
 * @param {number} [R] arch radius, mm
 * @returns {{R: number, dx: number, dl: number}} radius, half-width at the skirt and the angle
 *   the arc dips below the axle centre
 */
export const arch = (r, R = r + ARCH_GAP) => {
  const dy = r - CLEARANCE;
  return { R, dx: Math.sqrt(R * R - dy * dy), dl: Math.asin(dy / R) };
};

/**
 * Total length, bellows included.
 * @param {object} inp validated bus input
 * @returns {number} mm
 */
export const total = (inp) => {
  const l = layout(inp).at(-1);
  return l.x0 + l.len;
};

/**
 * Overhangs and wheelbases of one section, derived from its axles.
 * @param {{length_mm: number, axles_mm: number[]}} s section
 * @returns {{front: number, rear: number, wheelbases: number[]}} mm
 */
export const spans = (s) => ({
  front: s.axles_mm[0],
  rear: s.length_mm - s.axles_mm.at(-1),
  wheelbases: s.axles_mm.slice(1).map((a, i) => a - s.axles_mm[i]),
});

/**
 * Tyre diameter: the given one, else computed from the size string (e.g. 295/80 R22.5).
 * @param {{size?: string, diameter_mm?: number}} tyre
 * @returns {number} mm, rounded
 */
export const tyreDia = (tyre) => {
  if (tyre.diameter_mm) return tyre.diameter_mm;
  const [, w, aspect, rim] = tyre.size.match(SIZE).map(Number);
  return Math.round((2 * w * aspect) / 100 + rim * INCH);
};
