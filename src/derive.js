import schema from '../schema/bus-input.schema.json' with { type: 'json' };
import { ARCH_GAP, CLEARANCE } from './dims.js';

const INCH = 25.4;
const SIZE = /^(\d{3})\/(\d{2}) ?R(\d{2}(?:\.\d)?)$/;
const DOOR_W = { 1: 900, 2: 1250 }, DOOR_END = 150, DOOR_ARCH = 300;  // width by leaves; kept clear of a body end and of an arch
const BIAS = { front: 0, middle: 0.5, rear: 1 };  // share of a zone's slack ahead of the door
const BAND_PCT = schema.properties.band_above_doors_and_windows_pct.default;
const WIN_SILL = 1250, WIN_W = 1400, WIN_MIN = 300;  // default band bottom above ground; pane width aimed at; narrowest pane drawn
const PILLAR = 80, WIN_END = 200;  // body between two panes and beside a door; kept clear of a body end

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
 * The line the doors and side windows reach up to: the body top less the band above them.
 * @param {object} inp validated bus input
 * @returns {number} mm above ground, rounded
 */
export const lintel = (inp) => Math.round(bodyTop(inp) * (1 - (inp.band_above_doors_and_windows_pct ?? BAND_PCT) / 100));

/**
 * All door hints, front to rear.
 * @param {object} inp validated bus input
 * @returns {object[]} door hints across the sections
 */
export const hints = (inp) => inp.sections.flatMap((s) => s.doors_hint ?? []);

/**
 * Width of a hinted door: the one given, else what its leaves imply.
 * @param {{leaves: number, width_mm?: number}} d door hint
 * @returns {number} mm
 */
export const doorWidth = (d) => d.width_mm ?? DOOR_W[d.leaves];

/** The span a door hint's zone leaves for a door: clear of the body ends and of the arches, dx wide each side. */
const zone = (s, dx, { zone: z, axle_gap: g = 0 }) => {
  const a = s.axles_mm, after = (x) => x + dx + DOOR_ARCH, before = (x) => x - dx - DOOR_ARCH;
  return {
    front_overhang: [DOOR_END, before(a[0])],
    between_axles: [after(a[g]), before(a[g + 1])],
    rear_overhang: [after(a.at(-1)), s.length_mm - DOOR_END],
  }[z];
};

/**
 * Places every hinted door: the zone gives a span, the bias a position in it. A door wider than
 * its span is centred on it.
 * @param {object} inp validated bus input
 * @returns {{x0: number, x1: number, leaves: number, glazed: boolean}[][]} per section its doors
 *   in hint order, as spans in mm from the section's own front
 */
export const doors = (inp) => {
  const { dx } = arch(tyreDia(inp.tyre) / 2);
  return inp.sections.map((s) =>
    (s.doors_hint ?? []).map((d) => {
      const [lo, hi] = zone(s, dx, d), w = doorWidth(d), slack = hi - lo - w;
      const x0 = Math.round(lo + slack * BIAS[slack < 0 ? 'middle' : d.bias ?? 'middle']);
      return { x0, x1: x0 + w, leaves: d.leaves, glazed: d.glazed ?? true };
    }),
  );
};

/**
 * The window band of a section: the one its windows_hint gives, else from the default sill up to
 * the lintel. The section's doors reach up to its top too.
 * @param {object} inp validated bus input
 * @param {number} i section index
 * @returns {number[]} bottom and top, mm above ground
 */
export const band = (inp, i) => inp.sections[i].windows_hint?.band_mm ?? [WIN_SILL, lintel(inp)];

/** What the blocks leave of a span, as runs front to rear. Blocks may overlap and stick out. */
const clear = (span, blocks) =>
  blocks.reduce((runs, [b0, b1]) => runs.flatMap(([x0, x1]) => [[x0, Math.min(x1, b0)], [Math.max(x0, b1), x1]].filter(([p, q]) => q > p)), [span]);

/**
 * Panes per run. A count is dealt out one pane at a time, each to the run it leaves the widest
 * panes in; without one every run gets the panes nearest WIN_W wide. No run takes more than stay
 * WIN_MIN wide in it, so a run shorter than that takes none.
 */
const deal = (runs, count) => {
  const len = runs.map(([x0, x1]) => x1 - x0 + PILLAR), room = len.map((l) => Math.floor(l / (WIN_MIN + PILLAR)));
  if (count === undefined) return len.map((l, k) => Math.min(room[k], Math.max(1, Math.round(l / (WIN_W + PILLAR)))));
  return Array.from({ length: count }).reduce((ns) => {
    const pitch = ns.map((n, j) => (n < room[j] ? len[j] / (n + 1) : 0)), k = pitch.indexOf(Math.max(...pitch));
    return pitch[k] ? ns.map((n, j) => (j === k ? n + 1 : n)) : ns;
  }, len.map(() => 0));
};

/** n equal panes across a run, a pillar between each two. */
const panes = ([x0, x1], n) => {
  const w = (x1 - x0 - (n - 1) * PILLAR) / n;
  return Array.from({ length: n }, (_, k) => x0 + k * (w + PILLAR)).map((x) => ({ x0: Math.round(x), x1: Math.round(x + w) }));
};

/**
 * Places the side windows of the entry side: each section is glazed with equal panes, a pillar
 * between each two, in the runs its doors leave. Wheel arches do not interrupt a run: where the
 * band reaches down into one, the pane runs on across it. windows_hint.count fixes a section's
 * number of panes, as far as they fit.
 * @param {object} inp validated bus input
 * @returns {{x0: number, x1: number}[][]} per section its panes front to rear, as spans in mm
 *   from the section's own front
 */
export const windows = (inp) => {
  const placed = doors(inp);
  return inp.sections.map((s, i) => {
    const runs = clear([WIN_END, s.length_mm - WIN_END], placed[i].map((d) => [d.x0 - PILLAR, d.x1 + PILLAR]));
    return deal(runs, s.windows_hint?.count).flatMap((n, k) => panes(runs[k], n));
  });
};

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
