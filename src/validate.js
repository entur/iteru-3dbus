import Ajv from 'ajv/dist/2020.js';
import { clashes, lintel, upper } from './derive.js';
import { CLEARANCE } from './dims.js';
import schema from '../schema/bus-input.schema.json' with { type: 'json' };

const ajv = new Ajv({ allErrors: true, strict: false, formats: { 'uri-reference': true } });
const chk = ajv.compile(schema);
const LOW = CLEARANCE + schema.properties.win_band_height_mm.minimum;  // rule (6): the lowest top of the lower windows

/** Cross-field rules (1), (4) and (6) from the schema's top-level $comment. (5) is door clashes. */
const rules = [
  (inp) =>
    inp.sections.flatMap((s, i) => [
      ...(s.axles_mm.every((a, j, xs) => j === 0 || a > xs[j - 1]) ? [] : [`sections[${i}].axles_mm must ascend`]),
      ...(s.axles_mm.every((a) => a > 0 && a < s.length_mm) ? [] : [`sections[${i}].axles_mm must lie inside the section`]),
    ]),
  (inp) =>
    inp.sections.flatMap((s, i) =>
      (s.doors_hint ?? [])
        .filter((d) => (d.axle_gap ?? 0) >= Math.max(s.axles_mm.length - 1, d.zone === 'between_axles' ? 0 : 1))
        .map((d) => `sections[${i}] has no axle gap ${d.axle_gap ?? 0}`),
    ),
  (inp) =>
    upper(inp) && lintel(inp) < LOW
      ? [`/upper_win_band_height_mm with the bands above the lower windows leaves their top at ${lintel(inp)} mm, under the ${LOW} mm they need (skirt plus win_band_height_mm's minimum)`]
      : [],
];

/** Rule (5), after (1) and (4): one message per clash of a placed door. */
const doorClashes = (inp) =>
  clashes(inp).map(({ section, door, other, axle, end }) =>
    other !== undefined ? `sections[${section}] door ${door + 1} lies on door ${other + 1}`
    : axle !== undefined ? `sections[${section}] door ${door + 1} lies on axle ${axle + 1}`
    : `sections[${section}] door ${door + 1} reaches past the ${end} end`);

/**
 * Validates a bus input against the schema, then the cross-field rules.
 * @param {unknown} inp parsed JSON
 * @returns {string[]} error messages, empty when valid
 */
export const validate = (inp) => {
  if (!chk(inp)) return chk.errors.map((e) => `${e.instancePath || '/'} ${e.keyword === 'not' ? 'takes doors or doors_hint, not both' : e.message}`);
  const errs = rules.flatMap((r) => r(inp));
  return errs.length ? errs : doorClashes(inp);
};
