import { validate } from './validate.js';

/**
 * A rough bus from a handful of facts: the input to `fromSpec`, for when only these are known.
 * @typedef {object} Spec
 * @property {number} length_mm total length, bellows included
 * @property {number} width_mm
 * @property {number} height_mm
 * @property {number} axles how many: rigid 2-3, articulated 3-4. The first is single, the rest twin, on a realistic tyre for the bus
 * @property {(1|2)[]|string} [doors] leaves of each door, front to rear: `[2, 2, 2]` or `"2+2+2"`. Missing or empty: no doors
 * @property {'single'|'double'} [decks] default single
 * @property {boolean} [articulated] default false
 * @property {boolean} [low_floor] default false
 * @property {string} [color] hex, default light grey
 */

// Tunables: proportions of a typical bus, as fractions of a length unless marked mm.
const COLOR = '#E9ECEC', BELLOWS = 600, LEAD = 0.58, PAIR = 1400;
const FRONT = 0.22, REAR2 = 0.26, REAR3 = 0.2;           // overhangs of a rigid bus, of its length
const ART_FRONT = 0.255, ART_REAR = 0.81, TRAIL_AT = 0.67, TRAIL_PAIR = 0.55;  // axle places in an articulated bus's sections
const WIN_LOW = 1500, WIN_HIGH = 1250;                   // side window band, mm: low floor | high floor
const MIDI = 9000;  // mm: up to this length a bus runs on 17.5" tyres
const MIN_FRONT = 1700;  // mm: a front overhang that still takes a door
const UPPER = 0.2, SIZE = /^\d{3}\/\d{2} ?R\d{2}(\.\d)?$/;

/** Door hints for doors of the given leaves in a section of `axles` axles; `first` is the section at the front. */
const hints = (ls, axles, first) =>
  ls.map((l, i) => {
    const n = ls.length, last = i === n - 1;
    const [zone, bias] = first
      ? i === 0 ? ['front_overhang'] : last && n > 2 ? ['rear_overhang'] : ['between_axles', n === 2 ? 'rear' : 'middle']
      : i === 0 ? ['front_overhang', n > 1 ? 'front' : undefined] : last ? ['rear_overhang'] : ['between_axles', 'middle'];
    return { zone, leaves: l, ...(bias && { bias }) };
  });

/** Parses `"2+2+2"` or `[2, 2, 2]` into leaves per door. */
const leaves = (doors = []) =>
  (typeof doors === 'string' ? doors.split(/\s*\+\s*/).filter(Boolean).map(Number) : doors);

/** A realistic tyre size: small for a midibus, wide for a double-decker, the usual 22.5" otherwise. */
const tyreOf = (L, decks) => (decks === 'double' ? '315/70 R22.5' : L <= MIDI ? '235/75 R17.5' : '295/80 R22.5');

/**
 * Builds a bus input from a few facts, with proportions of a typical bus filled in: where the axles
 * and doors lie, how the body splits when articulated, the bands for windows. Images from it are
 * rough but have the right proportions.
 * @param {Spec} spec
 * @returns {{ok: true, inp: object} | {ok: false, errs: string[]}}
 */
export const fromSpec = (spec) => {
  const { length_mm: L, width_mm, height_mm, axles, decks = 'single', articulated = false, low_floor = false, color = COLOR } = spec ?? {};
  const ls = leaves(spec?.doors);
  const errs = [
    ...(Number.isFinite(L) ? [] : ['length_mm must be a number']),
    ...(Number.isInteger(axles) && axles >= 2 && axles <= (articulated ? 4 : 3) ? [] : [`${articulated ? 'an articulated' : 'a rigid'} bus takes ${articulated ? '3-4' : '2-3'} axles`]),
    ...(ls.every((l) => l === 1 || l === 2) ? [] : ['doors are 1 or 2 leaves each']),
    ...(decks === 'single' || decks === 'double' ? [] : ['decks is single or double']),
    ...(articulated && decks === 'double' ? ['an articulated double-decker is not drawn'] : []),
  ];
  if (errs.length) return { ok: false, errs };

  const n = axles;
  const ends = articulated ? [Math.round((L - BELLOWS) * LEAD), L - BELLOWS - Math.round((L - BELLOWS) * LEAD)] : [L];
  const lead = articulated ? 2 : n;
  const front = articulated ? Math.round(ends[0] * ART_FRONT) : Math.max(Math.round(L * FRONT), MIN_FRONT);
  const rear = (len, k) => (k === 3 ? Math.round(len * (1 - REAR3)) : Math.round(len * (1 - REAR2)));
  const leadAxles = articulated ? [front, Math.round(ends[0] * ART_REAR)]
    : n === 2 ? [front, rear(L, 2)]
    : [front, rear(L, 3) - PAIR, rear(L, 3)];
  const trailAt = Math.round(ends[1] * (n - lead === 2 ? TRAIL_PAIR : TRAIL_AT));
  const trailAxles = n - lead === 2 ? [trailAt - PAIR / 2, trailAt + PAIR / 2] : [trailAt];

  const cut = articulated ? Math.min(ls.length, Math.max(2, ls.length - Math.ceil(ls.length / 3))) : ls.length;
  const split = [ls.slice(0, cut), ls.slice(cut)];
  const sec = (len, ax, ds, first) => ({
    length_mm: len, axles_mm: ax,
    ...(ds.length && { doors_hint: hints(ds, ax.length, first) }),
  });
  const sections = articulated
    ? [sec(ends[0], leadAxles, split[0], true), { ...sec(ends[1], trailAxles, split[1], false), bellows_ahead_mm: BELLOWS }]
    : [sec(L, leadAxles, ls, true)];

  const two = decks === 'double';
  const inp = {
    schema_version: '3.0', width_mm, height_mm,
    tyre: { size: tyreOf(L, decks), rear_twin: true },
    base_color: { hex: color },
    win_band_height_mm: low_floor ? WIN_LOW : WIN_HIGH,
    ...(two && { upper_win_band_height_mm: Math.round(height_mm * UPPER / 50) * 50 }),
    sections,
  };
  const bad = validate(inp);
  return bad.length ? { ok: false, errs: bad } : { ok: true, inp };
};
